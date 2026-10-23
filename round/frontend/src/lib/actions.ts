import { LockingScript, P2PKH, PublicKey, PushDrop, WalletClient, type CreateActionOutput } from '@bsv/sdk'
import {
  BASKET,
  PROTOCOL_ID,
  RECORD_SATS,
  SIGNING_COUNTERPARTY,
  encodeCloseFields,
  encodeCommitFields,
  encodeEligibilityFields,
  encodeTermsFields,
  escrowKeyId,
  escrowLockingKey,
  isSpendableKey,
  sameKey,
  settlementPayments,
  signRecordedDesk,
  type CloseRecord,
  type DeskState
} from '../../../protocol/round'
import { originator } from './config'
import { submitRoundTx, txFromWalletBeef } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface RecordResult {
  roundId: string
  txid: string
  settleTxid?: string
  issuerKey: string
  desk: DeskState
  /** Set when v0 locked the escrow but did not spend it into the computed payout. */
  payoutNote?: string
  overlayError?: string
}

const COUNTERPARTY = SIGNING_COUNTERPARTY

export function parseWhole(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function assertCanRecord(desk: DeskState): void {
  if (!desk.terms) throw new Error('Open a raise first.')
  if (desk.commits.length < 1) throw new Error('Commit into escrow before recording.')
}

export function payoutsAreSpendable(close: CloseRecord, issuerKey: string): boolean {
  const payments = settlementPayments(close, issuerKey)
  return payments.length > 0 && payments.every((row) => isSpendableKey(row.identityKey) && row.satoshis >= 1)
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

function clip(label: string): string {
  const text = label.trim()
  return text.length <= 50 ? text : text.slice(0, 50)
}

async function assertEscrowKey(wallet: WalletClient, issuerKey: string, roundId: string): Promise<string> {
  const keyID = escrowKeyId(roundId)
  const { publicKey } = await withTimeout(
    wallet.getPublicKey({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: COUNTERPARTY,
      forSelf: true
    }),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  if (!sameKey(publicKey, escrowLockingKey(issuerKey, roundId))) {
    throw new Error('Wallet escrow key does not match the public derivation.')
  }
  return keyID
}

async function lockField(
  wallet: WalletClient,
  fields: number[][],
  roundId: string,
  keyID: string,
  tag: string,
  outputDescription: string,
  satoshis: number
): Promise<CreateActionOutput> {
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(fields, PROTOCOL_ID, keyID, COUNTERPARTY, true, false),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  return {
    satoshis,
    lockingScript: lockingScript.toHex(),
    outputDescription,
    basket: BASKET,
    customInstructions: JSON.stringify({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: COUNTERPARTY,
      forSelf: true,
      roundId
    }),
    tags: [BASKET, tag, roundId]
  }
}

function outputIndex(txBytes: number[], lockingScriptHex: string): number {
  const tx = txFromWalletBeef(txBytes)
  const index = tx.outputs.findIndex((output) => output.lockingScript.toHex() === lockingScriptHex)
  if (index < 0) throw new Error('The escrow output is missing from the raise transaction.')
  return index
}

export async function recordRound(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  desk: DeskState
): Promise<RecordResult> {
  assertCanRecord(desk)
  const signed = await signRecordedDesk(wallet, desk)
  const terms = signed.terms
  if (!terms) throw new Error('Open a raise first.')
  if (!sameKey(terms.issuerKey, identityKey)) {
    throw new Error('Issuer key does not match the wallet.')
  }
  const roundId = terms.roundId
  const keyID = await assertEscrowKey(wallet, terms.issuerKey, roundId)
  const outputs: CreateActionOutput[] = [
    await lockField(wallet, encodeTermsFields(terms), roundId, keyID, 'terms', clip(`Raise ${terms.name}`), RECORD_SATS)
  ]
  for (const row of signed.eligibilities) {
    outputs.push(await lockField(
      wallet,
      encodeEligibilityFields(row),
      roundId,
      keyID,
      'eligibility',
      clip(`Eligibility ${row.backerKey.slice(0, 8)}`),
      RECORD_SATS
    ))
  }
  const commitOutputs: Array<{ sats: number, lockingScript: string }> = []
  for (const row of signed.commits) {
    const output = await lockField(
      wallet,
      encodeCommitFields(row),
      roundId,
      keyID,
      'commit',
      clip(`Escrow ${row.sats}`),
      row.sats
    )
    commitOutputs.push({ sats: row.sats, lockingScript: output.lockingScript })
    outputs.push(output)
  }
  if (signed.close) {
    outputs.push(await lockField(
      wallet,
      encodeCloseFields(signed.close),
      roundId,
      keyID,
      'close',
      clip(`Close ${signed.close.outcome}`),
      RECORD_SATS
    ))
  }

  const settling = Boolean(signed.close && payoutsAreSpendable(signed.close, terms.issuerKey))
  const lockTime = Math.floor(Date.now() / 1000)
  const created = await wallet.createAction({
    description: clip(`Raise ${terms.name}`),
    outputs,
    labels: [BASKET, 'raise'],
    lockTime,
    options: settling ? { noSend: true, randomizeOutputs: false } : { randomizeOutputs: false }
  })
  let txid = created.txid
  let tx = created.tx as number[] | undefined
  if ((!txid || !tx) && created.signableTransaction) {
    const signedTx = await wallet.signAction({
      reference: created.signableTransaction.reference,
      spends: {},
      options: settling ? { noSend: true } : undefined
    })
    txid = signedTx.txid
    tx = signedTx.tx as number[] | undefined
  }
  if (!txid || !tx) {
    throw Object.assign(new Error('Wallet did not return a transaction'), { cause: created })
  }

  const broadcast: number[][] = []
  let settleTxid: string | undefined
  let payoutNote: string | undefined
  if (signed.close && settling) {
    const payments = settlementPayments(signed.close, terms.issuerKey)
    const spendOutputs: CreateActionOutput[] = payments.map((payment) => ({
      satoshis: payment.satoshis,
      lockingScript: p2pkhFromPublicKey(payment.identityKey),
      outputDescription: clip(payment.role === 'proceeds' ? 'Raise proceeds' : 'Refund backer')
    }))
    const inputs = commitOutputs.map((output) => ({
      outpoint: `${txid}.${outputIndex(tx, output.lockingScript)}`,
      inputDescription: 'Spend round escrow',
      unlockingScriptLength: 200,
      sats: output.sats,
      lockingScript: output.lockingScript
    }))
    const spend = await wallet.createAction({
      description: clip(`Settle ${terms.name}`),
      inputBEEF: tx,
      inputs: inputs.map(({ outpoint, inputDescription, unlockingScriptLength }) => ({
        outpoint,
        inputDescription,
        unlockingScriptLength
      })),
      outputs: spendOutputs,
      labels: [BASKET, 'settle'],
      lockTime,
      options: { randomizeOutputs: false, trustSelf: 'known', knownTxids: [txid] }
    })
    if (!spend.signableTransaction) throw new Error('Wallet did not return a signable spend')
    const txToSign = txFromWalletBeef(spend.signableTransaction.tx as number[])
    inputs.forEach((input, index) => {
      txToSign.inputs[index].unlockingScriptTemplate = pushdrop(wallet).unlock(
        PROTOCOL_ID,
        keyID,
        COUNTERPARTY,
        'all',
        false,
        input.sats,
        LockingScript.fromHex(input.lockingScript)
      )
    })
    await txToSign.sign()
    const spends: Record<string, { unlockingScript: string }> = {}
    inputs.forEach((_input, index) => {
      const unlockingScript = txToSign.inputs[index].unlockingScript?.toHex()
      if (!unlockingScript) throw new Error('Failed to build unlocking script')
      spends[String(index)] = { unlockingScript }
    })
    const settled = await wallet.signAction({
      reference: spend.signableTransaction.reference,
      spends,
      options: { sendWith: [txid] }
    })
    if (!settled.txid || !settled.tx) throw new Error('Wallet did not return a signed transaction')
    settleTxid = settled.txid
    broadcast.push(tx, settled.tx as number[])
  } else {
    broadcast.push(tx)
    if (signed.close) {
      payoutNote = 'The refund and the allocation are recorded. v0 did not spend the escrow into those outputs because a backer key is not a wallet key. OP_PUSH_TX enforcement is v1 work.'
    }
  }

  try {
    for (const body of broadcast) await submitRoundTx(overlayUrl, body)
    return { roundId, txid, settleTxid, issuerKey: terms.issuerKey, desk: signed, payoutNote }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      roundId,
      txid,
      settleTxid,
      issuerKey: terms.issuerKey,
      desk: signed,
      payoutNote,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}
