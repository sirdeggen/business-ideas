import {
  P2PKH,
  PublicKey,
  PushDrop,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  BRC29_PROTOCOL_ID,
  PROTOCOL_ID,
  decideSpend,
  encodePolicyFields,
  encodeSpendFields,
  isIdentityKey,
  newPolicyId,
  normalizePayee,
  type AllowedPayee,
  type PolicyPayload
} from '../../../protocol/spendpolicy'
import { originator } from './config'
import {
  lookupPolicy,
  submitPolicyTx,
  type OverlayPolicy,
  type OverlaySpend
} from './overlay'

export interface WriteInput {
  dailyCapSats: number
  expiry: string
  payees: AllowedPayee[]
}

export interface WriteResult {
  policyId: string
  txid: string
  overlayError?: string
}

export interface SpendInput {
  payeeIdentity: string
  amountSats: number
  payeeName?: string
}

export interface SpendResult {
  txid: string
  amountSats: number
  payee: string
  overlayError?: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

export function assertCanWrite(input: WriteInput): AllowedPayee[] {
  const payees = input.payees
    .map((payee) => normalizePayee(payee))
    .filter((payee): payee is AllowedPayee => Boolean(payee))
  if (payees.length === 0) throw new Error('Add at least one allowed payee.')
  if (!payees.some((payee) => payee.identityKey && isIdentityKey(payee.identityKey))) {
    throw new Error('At least one allowed payee needs an identity key so a spend can be paid.')
  }
  return payees
}

export async function writePolicy(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: WriteInput
): Promise<WriteResult> {
  const payees = assertCanWrite(input)
  const policyId = newPolicyId()
  const createdAt = nowIso()
  const keyID = randomKeyId()
  const lockingScript = await pushdrop(wallet).lock(
    encodePolicyFields({
      policyId,
      treasurer: identityKey,
      dailyCapSats: input.dailyCapSats,
      expiry: input.expiry,
      payees,
      createdAt
    }),
    PROTOCOL_ID,
    keyID,
    'self',
    true,
    false
  )

  const response = await wallet.createAction({
    description: 'Write spend policy',
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: 'Spend policy',
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags: [BASKET, 'policy', policyId]
    }],
    labels: [BASKET, 'write'],
    options: { randomizeOutputs: false }
  })

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a policy transaction')
  }

  try {
    await submitPolicyTx(overlayUrl, response.tx as number[])
    return { policyId, txid: response.txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      policyId,
      txid: response.txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function spendAgainstPolicy(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  policy: OverlayPolicy,
  spends: OverlaySpend[],
  input: SpendInput,
  now = new Date()
): Promise<SpendResult> {
  const live = await lookupPolicy(overlayUrl, policy.policyId, policy.txid || undefined)
  const current = live.policy ?? policy
  const knownSpends = live.spends.length > 0 ? live.spends : spends
  const decision = decideSpend({
    policy: current as PolicyPayload,
    payeeIdentity: input.payeeIdentity,
    amountSats: input.amountSats,
    now,
    spends: knownSpends,
    payeeName: input.payeeName
  })
  if (!decision.ok) throw new Error(decision.reason)

  const derivationPrefix = randomKeyId()
  const derivationSuffix = randomKeyId()
  const { publicKey: derived } = await wallet.getPublicKey({
    protocolID: BRC29_PROTOCOL_ID,
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: input.payeeIdentity,
    forSelf: false
  })
  const paymentScript = p2pkhFromPublicKey(derived)

  const receiptKeyId = randomKeyId()
  const spentAt = nowIso()
  const receiptScript = await pushdrop(wallet).lock(
    encodeSpendFields({
      policyId: current.policyId,
      spender: identityKey,
      payee: input.payeeIdentity,
      amountSats: input.amountSats,
      spentAt,
      payeeName: input.payeeName
    }),
    PROTOCOL_ID,
    receiptKeyId,
    'self',
    true,
    false
  )

  const response = await wallet.createAction({
    description: `Spend ${input.amountSats} sats`,
    outputs: [
      {
        satoshis: input.amountSats,
        lockingScript: paymentScript,
        outputDescription: `Payment to allowed payee`,
        customInstructions: JSON.stringify({
          derivationPrefix,
          derivationSuffix,
          payee: input.payeeIdentity
        })
      },
      {
        satoshis: 1,
        lockingScript: receiptScript.toHex(),
        outputDescription: `Spend against policy ${current.policyId}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID: receiptKeyId,
          counterparty: 'self'
        }),
        tags: [BASKET, 'spend', current.policyId]
      }
    ],
    labels: [BASKET, 'spend', current.policyId],
    options: { randomizeOutputs: false }
  })

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a spend transaction')
  }

  try {
    await submitPolicyTx(overlayUrl, response.tx as number[])
    return {
      txid: response.txid,
      amountSats: input.amountSats,
      payee: input.payeeIdentity
    }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      txid: response.txid,
      amountSats: input.amountSats,
      payee: input.payeeIdentity,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}
