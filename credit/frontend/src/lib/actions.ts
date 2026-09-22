import {
  P2PKH,
  PublicKey,
  PushDrop,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  PROTOCOL_ID,
  TOKEN_SATS,
  assertCanDraw,
  assertCanFlagDefault,
  assertCanRepay,
  assertCanTerm,
  encodeDefaultFields,
  encodeDrawFields,
  encodeRepayFields,
  encodeTermFields,
  facilityStatus,
  newFacilityId,
  nowIso,
  outstandingSats,
  utcDate,
  type CreditTerm
} from '../../../protocol/credit'
import { originator } from './config'
import { NOT_LENDER } from './copy'
import { nudgeCredit } from './messagebox'
import { submitCreditTx, type FacilityView } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface TermForm {
  borrower: string
  limitSats: number
  maturity: string
  collateral: string
  deskFeeBps: number
  underwritingFeeSats: number
  underwritingNote: string
}

export interface ActionResult {
  facilityId: string
  txid: string
  overlayError?: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

function wholeNumber(raw: string): number {
  const cleaned = raw.replace(/,/g, '').trim()
  if (!/^\d+$/.test(cleaned)) throw new Error('Enter a whole number.')
  return Number(cleaned)
}

export function parseWhole(raw: string): number {
  return wholeNumber(raw)
}

async function finishAction(
  wallet: WalletClient,
  response: Awaited<ReturnType<WalletClient['createAction']>>
): Promise<{ txid: string, tx: number[] }> {
  let txid = response.txid
  let tx = response.tx as number[] | undefined
  if ((!txid || !tx) && response.signableTransaction) {
    const signed = await wallet.signAction({
      reference: response.signableTransaction.reference,
      spends: {}
    })
    txid = signed.txid
    tx = signed.tx as number[] | undefined
  }
  if (!txid || !tx) {
    throw Object.assign(new Error('Wallet did not return a credit transaction'), { cause: response })
  }
  return { txid, tx }
}

async function overlayOrError(overlayUrl: string, tx: number[], facilityId: string, txid: string): Promise<ActionResult> {
  try {
    await submitCreditTx(overlayUrl, tx)
    return { facilityId, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return { facilityId, txid, overlayError: detail.trim() || 'overlay submit failed with no message' }
  }
}

function viewOutstanding(view: FacilityView): number {
  return view.outstanding ?? outstandingSats(view.draws, view.repays)
}

export function assertTermForm(input: TermForm, lenderIdentity: string, asOf = utcDate()) {
  return assertCanTerm({ ...input, lenderIdentity }, asOf)
}

export async function openFacility(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: TermForm,
  now = new Date()
): Promise<ActionResult> {
  const ready = assertCanTerm({ ...input, lenderIdentity: identityKey, openedAt: nowIso(now) }, utcDate(now))
  const facilityId = newFacilityId()
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeTermFields({
        facilityId,
        borrower: ready.borrower,
        lenderIdentity: identityKey,
        limitSats: ready.limitSats,
        maturity: ready.maturity,
        collateral: ready.collateral,
        deskFeeBps: ready.deskFeeBps,
        underwritingFeeSats: ready.underwritingFeeSats,
        underwritingNote: ready.underwritingNote,
        openedAt: ready.openedAt
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const outputs: Array<{
    satoshis: number
    lockingScript: string
    outputDescription: string
    basket?: string
    customInstructions?: string
    tags?: string[]
  }> = []
  if (ready.underwritingFeeSats > 0) {
    outputs.push({
      satoshis: ready.underwritingFeeSats,
      lockingScript: p2pkhFromPublicKey(identityKey),
      outputDescription: `Underwriting write fee for ${ready.borrower}`
    })
  }
  outputs.push({
    satoshis: TOKEN_SATS,
    lockingScript: lockingScript.toHex(),
    outputDescription: `Credit facility ${ready.borrower}`,
    basket: BASKET,
    customInstructions: JSON.stringify({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: 'self',
      facilityId
    }),
    tags: [BASKET, 'term', facilityId]
  })

  const response = await wallet.createAction({
    description: `Term ${ready.borrower}`,
    outputs,
    labels: [BASKET, 'term'],
    options: { randomizeOutputs: false }
  })
  const { txid, tx } = await finishAction(wallet, response)
  return overlayOrError(overlayUrl, tx, facilityId, txid)
}

export async function drawFacility(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  view: FacilityView,
  principalSats: number,
  now = new Date()
): Promise<ActionResult> {
  if (!view.term) throw new Error('This facility wasn’t found.')
  const status = view.status ?? facilityStatus({
    term: true,
    outstanding: viewOutstanding(view),
    drawCount: view.draws.length,
    repayCount: view.repays.length,
    flagged: Boolean(view.flag)
  })
  const ready = assertCanDraw(view.term, status, viewOutstanding(view), principalSats, utcDate(now))
  const facilityId = view.term.facilityId
  const drawId = newFacilityId()
  const keyID = randomKeyId()
  const drawnAt = nowIso(now)
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeDrawFields({
        facilityId,
        drawId,
        drawerIdentity: identityKey,
        principalSats: ready.principalSats,
        feeSats: ready.feeSats,
        drawnAt
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  const outputs: Array<{
    satoshis: number
    lockingScript: string
    outputDescription: string
    basket?: string
    customInstructions?: string
    tags?: string[]
  }> = []
  if (ready.feeSats > 0) {
    outputs.push({
      satoshis: ready.feeSats,
      lockingScript: p2pkhFromPublicKey(view.term.lenderIdentity),
      outputDescription: `Desk fee on draw ${facilityId}`
    })
  }
  outputs.push({
    satoshis: TOKEN_SATS,
    lockingScript: lockingScript.toHex(),
    outputDescription: `Draw on ${facilityId}`,
    basket: BASKET,
    customInstructions: JSON.stringify({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: 'self',
      facilityId
    }),
    tags: [BASKET, 'draw', facilityId]
  })
  const response = await wallet.createAction({
    description: `Draw ${facilityId}`,
    outputs,
    labels: [BASKET, 'draw'],
    options: { randomizeOutputs: false }
  })
  const { txid, tx } = await finishAction(wallet, response)
  await nudgeCredit(wallet, identityKey, view.term.lenderIdentity, { kind: 'draw', facilityId, txid })
  return overlayOrError(overlayUrl, tx, facilityId, txid)
}

export async function repayFacility(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  view: FacilityView,
  amountSats: number,
  now = new Date()
): Promise<ActionResult> {
  if (!view.term) throw new Error('This facility wasn’t found.')
  const status = view.status ?? facilityStatus({
    term: true,
    outstanding: viewOutstanding(view),
    drawCount: view.draws.length,
    repayCount: view.repays.length,
    flagged: Boolean(view.flag)
  })
  const amount = assertCanRepay(status, viewOutstanding(view), amountSats)
  const facilityId = view.term.facilityId
  const repayId = newFacilityId()
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeRepayFields({
        facilityId,
        repayId,
        payerIdentity: identityKey,
        amountSats: amount,
        repaidAt: nowIso(now)
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  const response = await wallet.createAction({
    description: `Repay ${facilityId}`,
    outputs: [
      {
        satoshis: amount,
        lockingScript: p2pkhFromPublicKey(view.term.lenderIdentity),
        outputDescription: `Repayment on ${facilityId}`
      },
      {
        satoshis: TOKEN_SATS,
        lockingScript: lockingScript.toHex(),
        outputDescription: `Repay ${facilityId}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID,
          counterparty: 'self',
          facilityId
        }),
        tags: [BASKET, 'repay', facilityId]
      }
    ],
    labels: [BASKET, 'repay'],
    options: { randomizeOutputs: false }
  })
  const { txid, tx } = await finishAction(wallet, response)
  await nudgeCredit(wallet, identityKey, view.term.lenderIdentity, { kind: 'repay', facilityId, txid })
  return overlayOrError(overlayUrl, tx, facilityId, txid)
}

export async function flagDefault(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  view: FacilityView,
  reason: string,
  now = new Date()
): Promise<ActionResult> {
  if (!view.term) throw new Error('This facility wasn’t found.')
  const term: CreditTerm = view.term
  if (term.lenderIdentity.toLowerCase() !== identityKey.toLowerCase()) throw new Error(NOT_LENDER)
  const status = view.status ?? facilityStatus({
    term: true,
    outstanding: viewOutstanding(view),
    drawCount: view.draws.length,
    repayCount: view.repays.length,
    flagged: Boolean(view.flag)
  })
  const cleanReason = assertCanFlagDefault(term, status, viewOutstanding(view), identityKey, reason, utcDate(now))
  const facilityId = term.facilityId
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeDefaultFields({
        facilityId,
        flaggerIdentity: identityKey,
        reason: cleanReason,
        flaggedAt: nowIso(now)
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  const response = await wallet.createAction({
    description: `Default ${facilityId}`,
    outputs: [
      {
        satoshis: TOKEN_SATS,
        lockingScript: lockingScript.toHex(),
        outputDescription: `Default flag ${facilityId}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID,
          counterparty: 'self',
          facilityId
        }),
        tags: [BASKET, 'default', facilityId]
      }
    ],
    labels: [BASKET, 'default'],
    options: { randomizeOutputs: false }
  })
  const { txid, tx } = await finishAction(wallet, response)
  return overlayOrError(overlayUrl, tx, facilityId, txid)
}
