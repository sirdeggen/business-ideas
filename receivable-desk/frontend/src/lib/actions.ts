import {
  Beef,
  LockingScript,
  P2PKH,
  PublicKey,
  PushDrop,
  Transaction,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  ADVANCE_BPS,
  BASKET,
  BRC29_PROTOCOL,
  PROTOCOL_ID,
  encodeReceivableFields,
  findPaymentOutputIndex,
  isIdentityKey,
  parseReceivableFields,
  type ReceivablePayload,
  type ReceivableStatus
} from '../../../protocol/receivable'
import { originator } from './config'
import { lookupReceivables, submitReceivableTx } from './overlay'

export interface HeldReceivable {
  outpoint: string
  satoshis: number
  item: ReceivablePayload
  customInstructions: string
  beef?: number[]
}

export interface CustomInstructions {
  protocolID: [0 | 1 | 2, string]
  keyID: string
  counterparty: string
}

export interface RegisterInput {
  invoiceId: string
  creditor: string
  debtor: string
  amountSats: number
  dueDate: string
  memo: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function parseInstructions(raw: string | undefined): CustomInstructions {
  if (!raw) {
    throw new Error('Receivable is missing customInstructions; the wallet cannot unlock it')
  }
  return JSON.parse(raw) as CustomInstructions
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function beefForOutpoint(listedBeef: number[] | undefined, outpoint: string): number[] | undefined {
  if (!listedBeef || listedBeef.length === 0) return listedBeef
  const [txid] = outpoint.split('.')
  const beef = new Beef()
  beef.mergeBeef(listedBeef)
  if (beef.findTxid(txid)) return beef.toBinaryAtomic(txid)
  return listedBeef
}

export async function listHeldReceivables(wallet: WalletClient): Promise<HeldReceivable[]> {
  const listed = await wallet.listOutputs({
    basket: BASKET,
    include: 'entire transactions',
    includeCustomInstructions: true,
    limit: 1000
  })

  const held: HeldReceivable[] = []
  for (const output of listed.outputs) {
    try {
      if (!output.lockingScript) continue
      const decoded = PushDrop.decode(LockingScript.fromHex(output.lockingScript))
      const item = parseReceivableFields(decoded.fields)
      if (!item) continue
      held.push({
        outpoint: output.outpoint,
        satoshis: Number(output.satoshis ?? 1),
        item,
        customInstructions: output.customInstructions ?? '',
        beef: beefForOutpoint(listed.BEEF as number[] | undefined, output.outpoint)
      })
    } catch {
      // Skip non-receivable basket items.
    }
  }
  return held
}

async function lockReceivable(
  wallet: WalletClient,
  item: Omit<ReceivablePayload, 'magic'>,
  counterparty: string,
  forSelf: boolean
): Promise<{ lockingScript: LockingScript, keyID: string, customInstructions: string }> {
  const keyID = randomKeyId()
  const lockingScript = await pushdrop(wallet).lock(
    encodeReceivableFields(item),
    PROTOCOL_ID,
    keyID,
    counterparty,
    forSelf,
    false
  )
  return {
    lockingScript,
    keyID,
    customInstructions: JSON.stringify({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty
    })
  }
}

export async function registerReceivable(
  wallet: WalletClient,
  overlayUrl: string,
  input: RegisterInput
): Promise<{ txid: string, invoiceId: string }> {
  if (!isIdentityKey(input.creditor) || !isIdentityKey(input.debtor)) {
    throw new Error('Creditor and debtor must be 66-hex compressed identity keys')
  }
  const duplicates = await lookupReceivables(overlayUrl, { invoiceId: input.invoiceId.trim() })
  if (duplicates.length > 0) {
    throw new Error(`Invoice ${input.invoiceId} is already registered`)
  }

  const locked = await lockReceivable(wallet, {
    invoiceId: input.invoiceId.trim(),
    creditor: input.creditor.trim(),
    debtor: input.debtor.trim(),
    amountSats: input.amountSats,
    dueDate: input.dueDate,
    status: 'open',
    memo: input.memo.trim(),
    advanceBps: 0
  }, 'self', true)

  let response
  try {
    response = await wallet.createAction({
      description: `Register receivable ${input.invoiceId}`,
      outputs: [{
        satoshis: 1,
        lockingScript: locked.lockingScript.toHex(),
        outputDescription: `Receivable ${input.invoiceId}`,
        basket: BASKET,
        customInstructions: locked.customInstructions,
        tags: [BASKET, 'register', input.invoiceId]
      }],
      labels: [BASKET, 'register'],
      options: { randomizeOutputs: false }
    })
  } catch (err) {
    const detail = err instanceof Error && err.message.trim() ? err.message : String(err ?? '')
    throw new Error(
      detail.trim()
        ? `createAction failed: ${detail}`
        : 'createAction failed with no message. Spending Request timed out, was rejected, overlay is offline, or Desktop is locked.'
    )
  }

  if (!response.txid || !response.tx) {
    throw new Error(
      'Wallet did not return a register transaction. Spending Request timed out, was rejected, or Desktop is locked.'
    )
  }

  const submitted = await submitReceivableTx(overlayUrl, response.tx as number[])
  if (submitted.admitted.length === 0) {
    throw new Error('Overlay rejected the register (no outputs admitted)')
  }
  return { txid: response.txid, invoiceId: input.invoiceId.trim() }
}

async function spendReceivable(
  wallet: WalletClient,
  held: HeldReceivable,
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
  let response
  try {
    response = await wallet.createAction({
      description,
      inputBEEF: held.beef,
      inputs: [{
        inputDescription: `Receivable ${held.item.invoiceId}`,
        outpoint: held.outpoint,
        unlockingScriptLength: 73
      }],
      outputs: newOutputs,
      labels: [BASKET],
      options: { randomizeOutputs: false }
    })
  } catch (err) {
    const detail = err instanceof Error && err.message.trim() ? err.message : String(err ?? '')
    throw new Error(
      detail.trim()
        ? `createAction failed: ${detail}`
        : 'createAction failed with no message. Spending Request timed out, was rejected, overlay is offline, or Desktop is locked.'
    )
  }

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

async function nextStateOutput(
  wallet: WalletClient,
  held: HeldReceivable,
  status: ReceivableStatus,
  advanceBps: number
): Promise<{
  satoshis: number
  lockingScript: string
  outputDescription: string
  basket: string
  customInstructions: string
  tags: string[]
}> {
  const locked = await lockReceivable(wallet, {
    ...held.item,
    status,
    advanceBps
  }, 'self', true)
  return {
    satoshis: 1,
    lockingScript: locked.lockingScript.toHex(),
    outputDescription: `${status} ${held.item.invoiceId}`,
    basket: BASKET,
    customInstructions: locked.customInstructions,
    tags: [BASKET, status, held.item.invoiceId]
  }
}

export async function approveReceivable(
  wallet: WalletClient,
  overlayUrl: string,
  held: HeldReceivable
): Promise<{ txid: string }> {
  if (held.item.status !== 'open') throw new Error('Only open invoices can be approved')
  const output = await nextStateOutput(wallet, held, 'approved', held.item.advanceBps)
  const spent = await spendReceivable(
    wallet,
    held,
    [output],
    `Approve receivable ${held.item.invoiceId}`
  )
  const submitted = await submitReceivableTx(overlayUrl, spent.tx)
  if (submitted.admitted.length === 0) {
    throw new Error('Overlay rejected the approve spend')
  }
  return { txid: spent.txid }
}

async function brc29PaymentOutput(
  wallet: WalletClient,
  payee: string,
  satoshis: number,
  invoiceId: string
): Promise<{
  satoshis: number
  lockingScript: string
  outputDescription: string
  derivationPrefix: string
  derivationSuffix: string
  customInstructions: string
}> {
  const derivationPrefix = randomKeyId()
  const derivationSuffix = randomKeyId()
  const { publicKey } = await wallet.getPublicKey({
    protocolID: BRC29_PROTOCOL,
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: payee,
    forSelf: false
  })
  const lockingScript = new P2PKH().lock(PublicKey.fromString(publicKey).toHash())
  return {
    satoshis,
    lockingScript: lockingScript.toHex(),
    outputDescription: `BRC-29 settle ${invoiceId}`,
    derivationPrefix,
    derivationSuffix,
    customInstructions: JSON.stringify({
      derivationPrefix,
      derivationSuffix,
      payee
    })
  }
}

export interface SettlePackage {
  tx: number[]
  txid: string
  invoiceId: string
  paymentOutputIndex: number
  derivationPrefix: string
  derivationSuffix: string
  senderIdentityKey: string
  amountSats: number
}

export async function settleReceivable(
  wallet: WalletClient,
  overlayUrl: string,
  held: HeldReceivable
): Promise<SettlePackage> {
  if (held.item.status === 'paid') throw new Error('Already paid')
  const paid = await nextStateOutput(wallet, held, 'paid', 0)
  const payment = await brc29PaymentOutput(
    wallet,
    held.item.creditor,
    held.item.amountSats,
    held.item.invoiceId
  )
  const spent = await spendReceivable(
    wallet,
    held,
    [paid, {
      satoshis: payment.satoshis,
      lockingScript: payment.lockingScript,
      outputDescription: payment.outputDescription,
      customInstructions: payment.customInstructions
    }],
    `BRC-29 settle ${held.item.invoiceId}`
  )
  const submitted = await submitReceivableTx(overlayUrl, spent.tx)
  if (submitted.admitted.length === 0) {
    throw new Error('Overlay rejected the settle spend')
  }
  const { publicKey: senderIdentityKey } = await wallet.getPublicKey({ identityKey: true })
  const settledTx = Transaction.fromBEEF(spent.tx)
  return {
    tx: spent.tx,
    txid: spent.txid,
    invoiceId: held.item.invoiceId,
    paymentOutputIndex: paymentOutputIndex(settledTx, held.item.amountSats),
    derivationPrefix: payment.derivationPrefix,
    derivationSuffix: payment.derivationSuffix,
    senderIdentityKey,
    amountSats: held.item.amountSats
  }
}

export async function acceptSettlePayment(
  wallet: WalletClient,
  pack: SettlePackage
): Promise<void> {
  await wallet.internalizeAction({
    tx: pack.tx,
    outputs: [{
      outputIndex: pack.paymentOutputIndex,
      protocol: 'wallet payment',
      paymentRemittance: {
        derivationPrefix: pack.derivationPrefix,
        derivationSuffix: pack.derivationSuffix,
        senderIdentityKey: pack.senderIdentityKey
      }
    }],
    description: `Accept BRC-29 settle for ${pack.invoiceId}`
  })
}

export function parseSettlePackage(raw: string): SettlePackage {
  const parsed = JSON.parse(raw) as SettlePackage
  if (!Array.isArray(parsed.tx) || !parsed.invoiceId || !parsed.derivationPrefix || !parsed.txid) {
    throw new Error('Not a receivable settle package')
  }
  return parsed
}

function paymentOutputIndex(tx: Transaction, amountSats: number): number {
  const satoshis = tx.outputs.map((output) => Number(output.satoshis ?? 0))
  let markerIndex = -1
  for (const [index, output] of tx.outputs.entries()) {
    try {
      const item = parseReceivableFields(PushDrop.decode(output.lockingScript).fields)
      if (item?.status === 'paid') {
        markerIndex = index
        break
      }
    } catch {
      // BRC-29 payment and change are not markers.
    }
  }
  const found = findPaymentOutputIndex(satoshis, markerIndex, amountSats, 1)
  return found >= 0 ? found : 1
}

export async function advanceReceivableOnChain(
  wallet: WalletClient,
  overlayUrl: string,
  held: HeldReceivable
): Promise<{ txid: string }> {
  if (held.item.status !== 'approved') {
    throw new Error('Advance-intent is only recorded against approved unpaid invoices')
  }
  const output = await nextStateOutput(wallet, held, 'approved', ADVANCE_BPS)
  const spent = await spendReceivable(
    wallet,
    held,
    [output],
    `Record 70% advance-intent ${held.item.invoiceId}`
  )
  const submitted = await submitReceivableTx(overlayUrl, spent.tx)
  if (submitted.admitted.length === 0) {
    throw new Error('Overlay rejected the advance-intent spend')
  }
  return { txid: spent.txid }
}

export { isIdentityKey }
