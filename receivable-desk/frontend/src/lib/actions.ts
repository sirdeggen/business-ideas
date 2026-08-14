import {
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
  MAGIC,
  encodeReceivableFields,
  findPaymentOutputIndex,
  isIdentityKey,
  isPartyIdentity,
  parseReceivableFields,
  validateReceivable,
  type ReceivablePayload,
  type ReceivableStatus
} from '../../../protocol/receivable'
import {
  inspectBaskets,
  type BasketInspection,
  type HeldReceivable,
  type ListOutputsFn
} from './basket'
import { originator } from './config'
import { lookupReceivables, submitReceivableTx } from './overlay'
import { chaseRowFromRegister, loadChaseRows, rememberChaseRow } from './persist'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export type { BasketInspection, HeldReceivable } from './basket'

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

function timedLister(client: WalletClient) {
  return (args: { basket: string, include?: 'entire transactions' | 'locking scripts', includeCustomInstructions?: boolean, limit: number }) =>
    withTimeout(client.listOutputs(args), CONNECT_MS, CONNECT_TIMEOUT_MESSAGE)
}

const EMPTY_BASKET: BasketInspection = {
  held: [],
  primary: {
    basket: BASKET,
    listed: 0,
    totalOutputs: 0,
    spendable: 0,
    parsed: 0,
    unparsed: []
  }
}

/** List basket `receivables` under the page host and `"simple"` — no mint under `"simple"`. */
export async function inspectHeldReceivables(wallet?: unknown): Promise<BasketInspection> {
  if (!wallet) return EMPTY_BASKET
  const client = wallet as WalletClient
  const listers: ListOutputsFn[] = []
  const seen = new Set<string>()
  const add = (listed: WalletClient, label: string): void => {
    if (!label || seen.has(label)) return
    seen.add(label)
    listers.push(timedLister(listed))
  }
  add(client, (client as WalletClient & { originator?: string }).originator || 'bound')
  add(new WalletClient('auto', originator()), originator())
  add(new WalletClient('auto', 'simple'), 'simple')
  return inspectBaskets(listers)
}

export async function listHeldReceivables(wallet: WalletClient): Promise<HeldReceivable[]> {
  return (await inspectHeldReceivables(wallet)).held
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

export interface RegisterResult {
  txid: string
  invoiceId: string
  overlayError?: string
}

export async function registerReceivable(
  wallet: WalletClient,
  overlayUrl: string,
  input: RegisterInput
): Promise<RegisterResult> {
  const item = {
    invoiceId: input.invoiceId.trim(),
    creditor: input.creditor.trim(),
    debtor: input.debtor.trim(),
    amountSats: input.amountSats,
    dueDate: input.dueDate,
    status: 'open' as const,
    memo: input.memo.trim(),
    advanceBps: 0
  }
  const invalid = validateReceivable({ magic: MAGIC, ...item })
  if (invalid) {
    if (invalid.includes('creditor') || invalid.includes('debtor')) {
      throw new Error('Who is owed and who owes us need a name or organisation.')
    }
    if (invalid.includes('differ')) {
      throw new Error('Who is owed and who owes us must be different.')
    }
    throw new Error(invalid)
  }
  if (loadChaseRows().some((row) => row.invoiceId === item.invoiceId)) {
    throw new Error(`Invoice ${input.invoiceId} is already registered`)
  }
  try {
    const duplicates = await withTimeout(
      lookupReceivables(overlayUrl, { invoiceId: item.invoiceId }),
      CONNECT_MS,
      CONNECT_TIMEOUT_MESSAGE
    )
    if (duplicates.length > 0) {
      throw new Error(`Invoice ${input.invoiceId} is already registered`)
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invoice ')) throw error
    // Overlay lookup failed or timed out — still allow createAction.
  }

  const locked = await withTimeout(
    lockReceivable(wallet, item, 'self', true),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  // Do not 8s-abort createAction — that races the Authorize click and drops the spend.
  const response = await wallet.createAction({
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

  let txid = response.txid
  let tx = response.tx as number[] | undefined
  if ((!txid || !tx) && response.signableTransaction) {
    const signed = await wallet.signAction({
      reference: response.signableTransaction.reference,
      spends: {}
    })
    txid = signed.txid
    tx = signed.tx as number[] | undefined
    if (!txid || !tx) {
      throw Object.assign(new Error('signAction returned no txid/tx'), { cause: signed })
    }
  }
  if (!txid || !tx) {
    throw Object.assign(new Error('createAction returned no txid/tx'), { cause: response })
  }

  rememberChaseRow(chaseRowFromRegister({ magic: MAGIC, ...item }, txid))

  // Spend is the register. Overlay submit is a separate step and must not hide the txid.
  try {
    const submitted = await submitReceivableTx(overlayUrl, tx)
    if (submitted.admitted.length === 0) {
      return {
        txid,
        invoiceId: input.invoiceId.trim(),
        overlayError: `no invoice outputs parsed after submit to ${submitted.topic} at ${submitted.host}`
      }
    }
    return { txid, invoiceId: input.invoiceId.trim() }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      txid,
      invoiceId: input.invoiceId.trim(),
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
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
    throw err instanceof Error ? err : new Error(String(err ?? 'createAction failed'))
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
  if (!isIdentityKey(held.item.creditor)) {
    throw new Error('Need an account id in Advanced to pay on-chain.')
  }
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
      let item = null
      for (const position of ['before', 'after'] as const) {
        try {
          item = parseReceivableFields(PushDrop.decode(output.lockingScript, position).fields)
          if (item) break
        } catch {
          // BRC-29 payment and change are not markers.
        }
      }
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

export { isIdentityKey, isPartyIdentity }
