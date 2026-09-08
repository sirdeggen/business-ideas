import {
  PushDrop,
  Transaction,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  CLAIM_SATS,
  MAGIC,
  PROTOCOL_ID,
  REDEEM_SATS,
  SCHEMA_VERSION,
  TRANSFER_SATS,
  encodeClaimFields,
  encodeRedeemFields,
  formatSats,
  isHolder,
  isIdentityKey,
  makeClaimId,
  makeRequestId,
  parseClaimFields,
  resolveSampleHash,
  validateClaim,
  validatePrice,
  validateRedeem,
  type ClaimToken
} from '../../../protocol/claim'
import { originator } from './config'
import { NOT_HOLDER } from './copy'
import { resolveIdentity } from './identity'
import { acceptTransfer, pullTransfers, sendTransfer } from './messagebox'
import { submitClaimTx, txFromWalletBeef } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface CustomInstructions {
  protocolID: [0 | 1 | 2, string]
  keyID: string
  counterparty: string
  claimId?: string
}

export interface HeldClaim {
  outpoint: string
  satoshis: number
  beef: number[]
  customInstructions?: string
  claim: ClaimToken
}

export interface IssueInput {
  label: string
  itemId: string
  sample: string
  priceSats: number
}

export interface IssueResult {
  claimId: string
  txid: string
  overlayError?: string
}

export interface TransferResult {
  claimId: string
  txid: string
  overlayError?: string
}

export interface RedeemReading {
  label: string
  itemId: string
  claimId: string
  requestId: string
  shipTo: string
  redeemed: string
}

export interface RedeemResult {
  reading: RedeemReading
  txid: string
  overlayError?: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function randomNonce(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toHex(Array.from(bytes))
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function parseInstructions(raw: string | undefined): CustomInstructions {
  if (!raw) {
    throw new Error('Claim is missing customInstructions; the wallet cannot unlock it')
  }
  return JSON.parse(raw) as CustomInstructions
}

function parseClaimScript(lockingScript: Parameters<typeof PushDrop.decode>[0]): ClaimToken | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseClaimFields(PushDrop.decode(lockingScript, position).fields)
      if (item && item.kind === 'claim') return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

function claimOutputIndex(tx: Transaction): number {
  for (const [index, output] of tx.outputs.entries()) {
    if (parseClaimScript(output.lockingScript)) return index
  }
  return 0
}

export function transferSpendInput(held: Pick<HeldClaim, 'outpoint'>): {
  inputDescription: string
  outpoint: string
  unlockingScriptLength: number
} {
  return {
    inputDescription: 'Vault claim',
    outpoint: held.outpoint,
    unlockingScriptLength: 73
  }
}

export function issuePriceSats(input: Pick<IssueInput, 'priceSats'>): number {
  return input.priceSats
}

export { formatSats }

export function assertCanIssue(input: IssueInput): void {
  if (!input.label.trim()) throw new Error('Label is required.')
  if (!input.itemId.trim()) throw new Error('Item id is required.')
  const priceError = validatePrice(input.priceSats)
  if (priceError) throw new Error(priceError)
}

export function assertCanTransfer(claim: Pick<ClaimToken, 'holder'>, identityKey: string): void {
  if (!isHolder(claim, identityKey)) throw new Error(NOT_HOLDER)
}

export function assertCanRedeem(claim: Pick<ClaimToken, 'holder'>, identityKey: string): void {
  if (!isHolder(claim, identityKey)) throw new Error(NOT_HOLDER)
}

export async function listHeldClaims(wallet: WalletClient): Promise<HeldClaim[]> {
  const listed = await wallet.listOutputs({
    basket: BASKET,
    include: 'entire transactions',
    includeCustomInstructions: true,
    limit: 200
  })
  const held: HeldClaim[] = []
  for (const output of listed.outputs ?? []) {
    const outpoint = typeof output.outpoint === 'string' ? output.outpoint : ''
    const [txid] = outpoint.split('.')
    if (!txid || !listed.BEEF) continue
    try {
      const tx = txFromWalletBeef(listed.BEEF as number[])
      const vout = Number(outpoint.split('.')[1])
      const locking = tx.outputs[vout]?.lockingScript
      if (!locking) continue
      const claim = parseClaimScript(locking)
      if (!claim) continue
      held.push({
        outpoint,
        satoshis: Number(output.satoshis ?? 1),
        beef: listed.BEEF as number[],
        customInstructions: output.customInstructions,
        claim
      })
    } catch {
      // Skip outputs this desk cannot parse.
    }
  }
  return held
}

export async function fulfillTransfers(wallet: WalletClient): Promise<void> {
  const notices = await pullTransfers(wallet)
  for (const notice of notices) {
    try {
      await acceptTransfer(wallet, notice)
    } catch {
      // Already internalized, or wallet declined.
    }
  }
}

async function spendClaim(
  wallet: WalletClient,
  held: HeldClaim,
  newOutputs: Array<{
    satoshis: number
    lockingScript: string
    outputDescription: string
    basket?: string
    customInstructions?: string
    tags?: string[]
  }>,
  description: string
): Promise<{ txid: string, tx: number[] }> {
  const instructions = parseInstructions(held.customInstructions)
  const response = await wallet.createAction({
    description,
    inputBEEF: held.beef,
    inputs: [transferSpendInput(held)],
    ...(newOutputs.length > 0 ? { outputs: newOutputs } : {}),
    labels: [BASKET],
    options: { randomizeOutputs: false }
  })

  if (!response.signableTransaction) {
    throw new Error('Wallet did not return a signable spend')
  }

  const txToSign = Transaction.fromBEEF(response.signableTransaction.tx)
  txToSign.inputs[0].unlockingScriptTemplate = pushdrop(wallet).unlock(
    instructions.protocolID,
    instructions.keyID,
    instructions.counterparty,
    'all',
    false,
    held.satoshis
  )
  await txToSign.sign()
  const unlockingScript = txToSign.inputs[0].unlockingScript?.toHex()
  if (!unlockingScript) throw new Error('Failed to build unlocking script')

  const signed = await wallet.signAction({
    reference: response.signableTransaction.reference,
    spends: {
      '0': { unlockingScript }
    }
  })

  if (!signed.txid || !signed.tx) {
    throw new Error('Wallet did not return a signed transaction')
  }
  return { txid: signed.txid, tx: signed.tx as number[] }
}

export async function issueClaim(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: IssueInput
): Promise<IssueResult> {
  assertCanIssue(input)
  const timestamp = nowIso()
  const sampleHash = resolveSampleHash(input.sample)
  const claimId = makeClaimId(identityKey, input.label.trim(), input.itemId.trim(), timestamp, randomNonce())
  const token = {
    claimId,
    label: input.label.trim(),
    itemId: input.itemId.trim(),
    sampleHash,
    holder: identityKey,
    issuer: identityKey,
    priceSats: input.priceSats,
    timestamp
  }
  const invalid = validateClaim({
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'claim',
    ...token
  })
  if (invalid) throw new Error(invalid)

  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeClaimFields(token),
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
    description: `Issue claim: ${token.label}`,
    outputs: [{
      satoshis: CLAIM_SATS,
      lockingScript: lockingScript.toHex(),
      outputDescription: token.label,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        claimId
      }),
      tags: [BASKET, 'claim', claimId]
    }],
    labels: [BASKET, 'issue'],
    options: { randomizeOutputs: false }
  })

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
    throw Object.assign(new Error('Wallet did not return an issue transaction'), { cause: response })
  }

  try {
    await submitClaimTx(overlayUrl, tx)
    return { claimId, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      claimId,
      txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function transferClaim(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  held: HeldClaim,
  recipientInput: string
): Promise<TransferResult> {
  assertCanTransfer(held.claim, identityKey)
  const recipient = await resolveIdentity(recipientInput)
  if (!isIdentityKey(recipient)) {
    throw new Error('Write a name or an account to transfer to.')
  }
  if (recipient === identityKey) {
    throw new Error('That account already holds this claim.')
  }

  const keyID = randomKeyId()
  const next = {
    claimId: held.claim.claimId,
    label: held.claim.label,
    itemId: held.claim.itemId,
    sampleHash: held.claim.sampleHash,
    holder: recipient,
    issuer: held.claim.issuer,
    priceSats: held.claim.priceSats,
    timestamp: nowIso()
  }
  const invalid = validateClaim({
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'claim',
    ...next
  })
  if (invalid) throw new Error(invalid)

  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeClaimFields(next),
      PROTOCOL_ID,
      keyID,
      recipient,
      false,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const spent = await spendClaim(
    wallet,
    held,
    [{
      satoshis: TRANSFER_SATS,
      lockingScript: lockingScript.toHex(),
      outputDescription: held.claim.label,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: identityKey,
        claimId: held.claim.claimId
      })
    }],
    `Transfer claim: ${held.claim.label}`
  )

  const outputIndex = claimOutputIndex(txFromWalletBeef(spent.tx))
  await sendTransfer(wallet, recipient, {
    kind: 'transfer',
    claimId: held.claim.claimId,
    tx: spent.tx,
    txid: spent.txid,
    outputIndex,
    keyID,
    sender: identityKey
  })

  try {
    await submitClaimTx(overlayUrl, spent.tx)
    return { claimId: held.claim.claimId, txid: spent.txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      claimId: held.claim.claimId,
      txid: spent.txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function redeemClaim(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  held: HeldClaim,
  shipTo: string
): Promise<RedeemResult> {
  assertCanRedeem(held.claim, identityKey)
  const destination = shipTo.trim()
  if (!destination) throw new Error('Ship to is required.')
  const timestamp = nowIso()
  const requestId = makeRequestId(held.claim.claimId, identityKey, timestamp, randomNonce())
  const receipt = {
    claimId: held.claim.claimId,
    label: held.claim.label,
    itemId: held.claim.itemId,
    holder: identityKey,
    requestId,
    shipTo: destination,
    timestamp
  }
  const invalid = validateRedeem({
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'redeem',
    ...receipt
  })
  if (invalid) throw new Error(invalid)

  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeRedeemFields(receipt),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const spent = await spendClaim(
    wallet,
    held,
    [{
      satoshis: REDEEM_SATS,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Redeem ${held.claim.label}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        claimId: held.claim.claimId
      }),
      tags: [BASKET, 'redeem', held.claim.claimId]
    }],
    `Redeem claim: ${held.claim.label}`
  )

  const reading: RedeemReading = {
    label: held.claim.label,
    itemId: held.claim.itemId,
    claimId: held.claim.claimId,
    requestId,
    shipTo: destination,
    redeemed: timestamp
  }

  try {
    await submitClaimTx(overlayUrl, spent.tx)
    return { reading, txid: spent.txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      reading,
      txid: spent.txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}
