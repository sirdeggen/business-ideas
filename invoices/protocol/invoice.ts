/**
 * Payable invoice protocol (PushDrop / BRC-48 fields).
 *
 * An invoice is a first-class on-chain object: one 1-sat PushDrop UTXO in a
 * BRC-100 basket. The payer settles it with a BRC-29 P2PKH output of the
 * billed satoshis plus a PushDrop receipt in the same transaction. Overlay
 * lookup keeps status (open / paid / voided) and rejects a second pay.
 */

export const PROTOCOL_ID: [0, string] = [0, 'invoices']
export const BASKET = 'invoices'
export const TOPIC = 'tm_invoices'
export const LOOKUP_SERVICE = 'ls_invoices'
/** Public overlay-us-1 catch-all. Local Docker keeps TOPIC / LOOKUP_SERVICE. */
export const PUBLIC_TOPIC = 'tm_anytx'
export const PUBLIC_LOOKUP = 'ls_anytx'
export const PUBLIC_OVERLAY_URL = 'https://overlay-us-1.bsvb.tech'
export const MAGIC = 'bsvinvoice'
export const PAID_MAGIC = 'bsvinvoice-paid'
export const BRC29_PROTOCOL_ID: [2, string] = [2, '3241645161d8']

export const MAX_MEMO_CHARS = 200
export const MAX_NAME_CHARS = 80
export const MIN_AMOUNT_SATS = 1
export const MAX_AMOUNT_SATS = 1_000_000_000_000

export type InvoiceStatus = 'open' | 'paid' | 'voided'

export interface InvoicePayload {
  magic: typeof MAGIC
  invoiceId: string
  payeeIdentity: string
  amountSats: number
  memo: string
  dueDate: string
  createdAt: string
  orgName: string
  billedTo: string
  amountUsd: string
}

export interface ReceiptRemittance {
  derivationPrefix: string
  derivationSuffix: string
  paymentOutputIndex: number
}

export interface ReceiptPayload {
  magic: typeof PAID_MAGIC
  invoiceId: string
  payeeIdentity: string
  payerIdentity: string
  amountSats: number
  invoiceOutpoint: string
  remittance: ReceiptRemittance
}

export type InvoiceAction = 'create' | 'pay' | 'void' | 'invalid'

export interface Classification {
  action: InvoiceAction
  admitOutputIndexes: number[]
  reason?: string
}

export function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

export function isIdentityKey(value: string): boolean {
  return /^(02|03)[0-9a-fA-F]{64}$/.test(value.trim())
}

export function isInvoiceId(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value)
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function isOutpoint(value: string): boolean {
  return /^[0-9a-fA-F]{64}\.\d+$/.test(value)
}

export function newInvoiceId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function assertAmountSats(amountSats: number): void {
  if (!Number.isInteger(amountSats) || amountSats < MIN_AMOUNT_SATS || amountSats > MAX_AMOUNT_SATS) {
    throw new Error(`Amount must be an integer between ${MIN_AMOUNT_SATS} and ${MAX_AMOUNT_SATS} sats`)
  }
}

export function assertMemo(memo: string): void {
  if (memo.length > MAX_MEMO_CHARS) {
    throw new Error(`Memo must be at most ${MAX_MEMO_CHARS} characters`)
  }
}

export function assertName(label: string, value: string): void {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required`)
  if (trimmed.length > MAX_NAME_CHARS) {
    throw new Error(`${label} must be at most ${MAX_NAME_CHARS} characters`)
  }
}

export function encodeInvoiceFields(invoice: Omit<InvoicePayload, 'magic'>): number[][] {
  assertAmountSats(invoice.amountSats)
  assertMemo(invoice.memo)
  assertName('Organization name', invoice.orgName)
  assertName('Billed-to name', invoice.billedTo)
  if (!isInvoiceId(invoice.invoiceId)) throw new Error('invoiceId must be 16 bytes hex')
  if (!isIdentityKey(invoice.payeeIdentity)) throw new Error('payeeIdentity must be a 66-hex compressed key')
  if (!isIsoDate(invoice.dueDate)) throw new Error('dueDate must be YYYY-MM-DD')
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(invoice.invoiceId),
    stringToUtf8Bytes(invoice.payeeIdentity),
    stringToUtf8Bytes(String(invoice.amountSats)),
    stringToUtf8Bytes(invoice.memo),
    stringToUtf8Bytes(invoice.dueDate),
    stringToUtf8Bytes(invoice.createdAt),
    stringToUtf8Bytes(JSON.stringify({
      orgName: invoice.orgName.trim(),
      billedTo: invoice.billedTo.trim(),
      amountUsd: invoice.amountUsd.trim()
    }))
  ]
}

function parseDisplayField(raw: string): Pick<InvoicePayload, 'orgName' | 'billedTo' | 'amountUsd'> {
  try {
    const parsed = JSON.parse(raw) as { orgName?: unknown, billedTo?: unknown, amountUsd?: unknown }
    return {
      orgName: typeof parsed.orgName === 'string' ? parsed.orgName : '',
      billedTo: typeof parsed.billedTo === 'string' ? parsed.billedTo : '',
      amountUsd: typeof parsed.amountUsd === 'string' ? parsed.amountUsd : ''
    }
  } catch {
    return { orgName: '', billedTo: '', amountUsd: '' }
  }
}

export function parseInvoiceFields(fields: Array<number[] | Uint8Array>): InvoicePayload | null {
  if (fields.length < 7) return null
  try {
    const asBytes = (field: number[] | Uint8Array): number[] => Array.from(field)
    const magic = utf8BytesToString(asBytes(fields[0]))
    if (magic !== MAGIC) return null
    const invoiceId = utf8BytesToString(asBytes(fields[1]))
    const payeeIdentity = utf8BytesToString(asBytes(fields[2]))
    const amountSats = Number(utf8BytesToString(asBytes(fields[3])))
    const memo = utf8BytesToString(asBytes(fields[4]))
    const dueDate = utf8BytesToString(asBytes(fields[5]))
    const createdAt = utf8BytesToString(asBytes(fields[6]))
    const display = fields.length >= 8
      ? parseDisplayField(utf8BytesToString(asBytes(fields[7])))
      : { orgName: '', billedTo: '', amountUsd: '' }
    if (!isInvoiceId(invoiceId) || !isIdentityKey(payeeIdentity) || !isIsoDate(dueDate)) return null
    assertAmountSats(amountSats)
    assertMemo(memo)
    return {
      magic: MAGIC,
      invoiceId,
      payeeIdentity,
      amountSats,
      memo,
      dueDate,
      createdAt,
      orgName: display.orgName,
      billedTo: display.billedTo,
      amountUsd: display.amountUsd
    }
  } catch {
    return null
  }
}

export function encodeReceiptFields(receipt: Omit<ReceiptPayload, 'magic'>): number[][] {
  assertAmountSats(receipt.amountSats)
  if (!isInvoiceId(receipt.invoiceId)) throw new Error('invoiceId must be 16 bytes hex')
  if (!isIdentityKey(receipt.payeeIdentity) || !isIdentityKey(receipt.payerIdentity)) {
    throw new Error('payee and payer must be 66-hex compressed keys')
  }
  if (!isOutpoint(receipt.invoiceOutpoint)) throw new Error('invoiceOutpoint must be txid.vout')
  if (!Number.isInteger(receipt.remittance.paymentOutputIndex) || receipt.remittance.paymentOutputIndex < 0) {
    throw new Error('paymentOutputIndex must be a non-negative integer')
  }
  if (!receipt.remittance.derivationPrefix || !receipt.remittance.derivationSuffix) {
    throw new Error('BRC-29 derivation prefix and suffix are required')
  }
  return [
    stringToUtf8Bytes(PAID_MAGIC),
    stringToUtf8Bytes(receipt.invoiceId),
    stringToUtf8Bytes(receipt.payeeIdentity),
    stringToUtf8Bytes(receipt.payerIdentity),
    stringToUtf8Bytes(String(receipt.amountSats)),
    stringToUtf8Bytes(receipt.invoiceOutpoint),
    stringToUtf8Bytes(JSON.stringify(receipt.remittance))
  ]
}

export function parseReceiptFields(fields: Array<number[] | Uint8Array>): ReceiptPayload | null {
  if (fields.length < 7) return null
  try {
    const asBytes = (field: number[] | Uint8Array): number[] => Array.from(field)
    const magic = utf8BytesToString(asBytes(fields[0]))
    if (magic !== PAID_MAGIC) return null
    const invoiceId = utf8BytesToString(asBytes(fields[1]))
    const payeeIdentity = utf8BytesToString(asBytes(fields[2]))
    const payerIdentity = utf8BytesToString(asBytes(fields[3]))
    const amountSats = Number(utf8BytesToString(asBytes(fields[4])))
    const invoiceOutpoint = utf8BytesToString(asBytes(fields[5]))
    const remittance = JSON.parse(utf8BytesToString(asBytes(fields[6]))) as ReceiptRemittance
    if (!isInvoiceId(invoiceId) || !isIdentityKey(payeeIdentity) || !isIdentityKey(payerIdentity)) return null
    if (!isOutpoint(invoiceOutpoint)) return null
    if (typeof remittance.derivationPrefix !== 'string' || typeof remittance.derivationSuffix !== 'string') {
      return null
    }
    if (!Number.isInteger(remittance.paymentOutputIndex) || remittance.paymentOutputIndex < 0) return null
    assertAmountSats(amountSats)
    return {
      magic: PAID_MAGIC,
      invoiceId,
      payeeIdentity,
      payerIdentity,
      amountSats,
      invoiceOutpoint,
      remittance
    }
  } catch {
    return null
  }
}

export function assertPayable(invoice: { status: InvoiceStatus } | null | undefined): void {
  if (!invoice) throw new Error('Unknown invoice')
  if (invoice.status === 'paid') throw new Error('Invoice already paid')
  if (invoice.status !== 'open') throw new Error(`Invoice is ${invoice.status}`)
}

export function isLocalOverlayUrl(url: string): boolean {
  if (!url) return false
  try {
    const hostname = new URL(url).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url)
  }
}

export function overlayServicesFor(base: string): {
  url: string
  local: boolean
  topic: string
  lookup: string
} {
  const url = base.replace(/\/$/, '')
  const local = isLocalOverlayUrl(url)
  return {
    url,
    local,
    topic: local ? TOPIC : PUBLIC_TOPIC,
    lookup: local ? LOOKUP_SERVICE : PUBLIC_LOOKUP
  }
}

export interface IndexedInvoice {
  invoice: InvoicePayload
  txid: string
  outputIndex: number
}

export interface IndexedReceipt {
  receipt: ReceiptPayload
  txid: string
  outputIndex: number
  paidAt?: string
}

export interface JoinedInvoice extends InvoicePayload {
  status: InvoiceStatus
  txid: string
  outputIndex: number
  paymentTxid?: string
  paymentOutputIndex?: number
  receiptTxid?: string
  receiptOutputIndex?: number
  payerIdentity?: string
  paidAt?: string
}

/**
 * Client-side join for ls_anytx: invoice PushDrop + receipt PushDrop → paid.
 * Local ls_invoices does this in storage; the public catch-all does not.
 */
export function joinInvoiceRecords(
  invoices: IndexedInvoice[],
  receipts: IndexedReceipt[]
): JoinedInvoice[] {
  const receiptById = new Map<string, IndexedReceipt>()
  for (const row of receipts) {
    if (!receiptById.has(row.receipt.invoiceId)) {
      receiptById.set(row.receipt.invoiceId, row)
    }
  }

  const seen = new Set<string>()
  const joined: JoinedInvoice[] = []
  for (const row of invoices) {
    if (seen.has(row.invoice.invoiceId)) continue
    seen.add(row.invoice.invoiceId)
    joined.push(applyReceipt(row, receiptById.get(row.invoice.invoiceId)))
  }

  for (const [invoiceId, paid] of receiptById) {
    if (seen.has(invoiceId)) continue
    seen.add(invoiceId)
    const [createTxid, createVout] = paid.receipt.invoiceOutpoint.split('.')
    joined.push(applyReceipt(
      {
        invoice: {
          magic: MAGIC,
          invoiceId,
          payeeIdentity: paid.receipt.payeeIdentity,
          amountSats: paid.receipt.amountSats,
          memo: '',
          dueDate: '',
          createdAt: '',
          orgName: '',
          billedTo: '',
          amountUsd: ''
        },
        txid: createTxid,
        outputIndex: Number(createVout ?? 0)
      },
      paid
    ))
  }

  return joined
}

function applyReceipt(row: IndexedInvoice, paid?: IndexedReceipt): JoinedInvoice {
  if (!paid) {
    return {
      ...row.invoice,
      status: 'open',
      txid: row.txid,
      outputIndex: row.outputIndex
    }
  }
  return {
    ...row.invoice,
    status: 'paid',
    txid: row.txid,
    outputIndex: row.outputIndex,
    paymentTxid: paid.txid,
    paymentOutputIndex: paid.receipt.remittance.paymentOutputIndex,
    receiptTxid: paid.txid,
    receiptOutputIndex: paid.outputIndex,
    payerIdentity: paid.receipt.payerIdentity,
    paidAt: paid.paidAt
  }
}

export function bindReceiptToInvoice(
  invoice: Pick<InvoicePayload, 'invoiceId' | 'payeeIdentity' | 'amountSats'>,
  receipt: ReceiptPayload
): void {
  if (receipt.invoiceId !== invoice.invoiceId) throw new Error('Receipt invoice id does not match')
  if (receipt.payeeIdentity !== invoice.payeeIdentity) throw new Error('Receipt payee does not match invoice')
  if (receipt.amountSats !== invoice.amountSats) throw new Error('Receipt amount does not match invoice')
}

/**
 * Prefer the receipt's claimed BRC-29 output index when it carries the billed
 * satoshis; otherwise find any other output with that exact amount (change is
 * usually a different value). Returns -1 when no payment output exists.
 */
export function findPaymentOutputIndex(
  outputSatoshis: number[],
  receiptIndex: number,
  amountSats: number,
  claimedIndex: number
): number {
  if (
    claimedIndex !== receiptIndex &&
    claimedIndex >= 0 &&
    claimedIndex < outputSatoshis.length &&
    outputSatoshis[claimedIndex] === amountSats
  ) {
    return claimedIndex
  }
  return outputSatoshis.findIndex((sats, index) => index !== receiptIndex && sats === amountSats)
}

/**
 * Stateless overlay admission rules:
 * - create: no prior invoices, N new unique invoice ids
 * - pay: one or more receipts, each paired with a same-tx output whose satoshis
 *   equal the billed amount (the BRC-29 payment). Invoice UTXOs are not spent.
 * - void: payee spends an invoice UTXO with no replacement and no receipt
 * Lookup (not this function) is what rejects a second pay for the same id.
 */
export function classifyInvoiceTransaction(
  inputInvoices: Array<{ index: number; invoice: InvoicePayload }>,
  outputInvoices: Array<{ index: number; invoice: InvoicePayload }>,
  outputReceipts: Array<{ index: number; receipt: ReceiptPayload }>,
  outputSatoshis: number[]
): Classification {
  if (inputInvoices.length === 0 && outputInvoices.length >= 1 && outputReceipts.length === 0) {
    const ids = outputInvoices.map(({ invoice }) => invoice.invoiceId)
    if (new Set(ids).size !== ids.length) {
      return { action: 'invalid', admitOutputIndexes: [], reason: 'duplicate invoice ids in create' }
    }
    return {
      action: 'create',
      admitOutputIndexes: outputInvoices.map(({ index }) => index)
    }
  }

  if (inputInvoices.length === 0 && outputInvoices.length === 0 && outputReceipts.length >= 1) {
    for (const { index, receipt } of outputReceipts) {
      const payIndex = findPaymentOutputIndex(
        outputSatoshis,
        index,
        receipt.amountSats,
        receipt.remittance.paymentOutputIndex
      )
      if (payIndex < 0) {
        return {
          action: 'invalid',
          admitOutputIndexes: [],
          reason: 'BRC-29 payment output missing or wrong satoshis'
        }
      }
    }
    const ids = outputReceipts.map(({ receipt }) => receipt.invoiceId)
    if (new Set(ids).size !== ids.length) {
      return { action: 'invalid', admitOutputIndexes: [], reason: 'duplicate invoice ids in pay' }
    }
    return {
      action: 'pay',
      admitOutputIndexes: outputReceipts.map(({ index }) => index)
    }
  }

  if (inputInvoices.length >= 1 && outputInvoices.length === 0 && outputReceipts.length === 0) {
    return { action: 'void', admitOutputIndexes: [] }
  }

  return {
    action: 'invalid',
    admitOutputIndexes: [],
    reason: 'not a create, pay, or void of a payable invoice'
  }
}
