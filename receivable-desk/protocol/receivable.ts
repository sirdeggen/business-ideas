/**
 * Receivable desk protocol (PushDrop / BRC-48 fields).
 *
 * Each live invoice is one UTXO. Status changes are spends that create the
 * next-state output (or a paid marker). This is a cheap public registry —
 * who is owed, by whom, amount, due, status — not a lender, not a bank,
 * and not a custodian of funds.
 */

export const PROTOCOL_ID: [0, string] = [0, 'receivables']
export const BRC29_PROTOCOL: [2, string] = [2, '3241645161d8']
export const BASKET = 'receivables'
export const TOPIC = 'tm_receivables'
export const LOOKUP_SERVICE = 'ls_receivables'
export const MAGIC = 'receivable'
export const ADVANCE_PERCENT = 70
export const ADVANCE_BPS = 7000

export const STATUSES = ['open', 'approved', 'paid'] as const
export type ReceivableStatus = typeof STATUSES[number]

export interface ReceivablePayload {
  magic: typeof MAGIC
  invoiceId: string
  creditor: string
  debtor: string
  amountSats: number
  dueDate: string
  status: ReceivableStatus
  memo: string
  advanceBps: number
}

export type ReceivableAction = 'register' | 'approve' | 'settle' | 'advance' | 'invalid'

export interface Classification {
  action: ReceivableAction
  admitOutputIndexes: number[]
  reason?: string
}

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const INVOICE_ID = /^[A-Za-z0-9._:-]{1,64}$/
export const DISPLAY_NAME_MAX = 80

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const MS_PER_DAY = 86_400_000

export function utcIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Days past due. Negative means the invoice is still on time. */
export function daysLate(dueDate: string, asOf = utcIsoDate()): number {
  const due = Date.parse(`${dueDate}T00:00:00Z`)
  const today = Date.parse(`${asOf}T00:00:00Z`)
  if (Number.isNaN(due) || Number.isNaN(today)) return 0
  return Math.round((today - due) / MS_PER_DAY)
}

export const AGING_LABELS = ['on time', 'a bit late', 'call them', 'board should know'] as const
export type AgingLabel = typeof AGING_LABELS[number]

export function agingLabel(days: number): AgingLabel {
  if (days <= 0) return 'on time'
  if (days <= 14) return 'a bit late'
  if (days <= 45) return 'call them'
  return 'board should know'
}

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

/** Person or org name on the Record form. Trimmed, 1–80 characters. */
export function isDisplayName(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length >= 1 && trimmed.length <= DISPLAY_NAME_MAX
}

/** On-chain party field: 66-hex identity key or a display name. */
export function isPartyIdentity(value: string): boolean {
  const trimmed = value.trim()
  return isIdentityKey(trimmed) || isDisplayName(trimmed)
}

/**
 * Resolve what to store for a party.
 * Advanced hex wins when present (must be a valid 66-hex key).
 * A 66-hex typed in the name field still records as hex.
 * Otherwise the trimmed name is stored.
 * If the name is empty, the connected wallet identity may fill it.
 */
export function resolvePartyIdentity(
  name: string,
  advancedHex = '',
  walletKey?: string | null
): string | null {
  const hex = advancedHex.trim()
  const label = name.trim()
  if (hex) return isIdentityKey(hex) ? hex : null
  if (isIdentityKey(label) || isDisplayName(label)) return label
  const fallback = walletKey?.trim() ?? ''
  return isIdentityKey(fallback) ? fallback : null
}

function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

export function encodeReceivableFields(item: Omit<ReceivablePayload, 'magic'>): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(item.invoiceId),
    stringToUtf8Bytes(item.creditor),
    stringToUtf8Bytes(item.debtor),
    stringToUtf8Bytes(String(item.amountSats)),
    stringToUtf8Bytes(item.dueDate),
    stringToUtf8Bytes(item.status),
    stringToUtf8Bytes(item.memo ?? ''),
    stringToUtf8Bytes(String(item.advanceBps ?? 0))
  ]
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

function magicIndex(fields: Array<number[] | Uint8Array>): number {
  return fields.findIndex((field) => {
    try {
      return fieldUtf8(field) === MAGIC
    } catch {
      return false
    }
  })
}

function payloadFromFields(
  fields: Array<number[] | Uint8Array>,
  start: number
): ReceivablePayload {
  const invoiceId = fieldUtf8(fields[start + 1])
  const creditor = fieldUtf8(fields[start + 2])
  const debtor = fieldUtf8(fields[start + 3])
  const amountSats = Number(fieldUtf8(fields[start + 4]))
  const dueDate = fieldUtf8(fields[start + 5])
  const status = fieldUtf8(fields[start + 6]) as ReceivableStatus
  const memo = fieldUtf8(fields[start + 7] ?? [])
  const advanceRaw = fields[start + 8] ? fieldUtf8(fields[start + 8]) : '0'
  const advanceBps = Number(advanceRaw)
  return {
    magic: MAGIC,
    invoiceId,
    creditor,
    debtor,
    amountSats,
    dueDate,
    status,
    memo,
    advanceBps: Number.isFinite(advanceBps) ? advanceBps : 0
  }
}

/**
 * Accepts live lock() scripts where MAGIC is anywhere in the field list.
 * Extra pubkey/signature fields may sit before or after the invoice.
 */
export function parseReceivableFields(fields: Array<number[] | Uint8Array>): ReceivablePayload | null {
  const start = magicIndex(fields)
  if (start < 0 || start + 7 >= fields.length) return null
  try {
    const parsed = payloadFromFields(fields, start)
    if (validateReceivable(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

/** Why parseReceivableFields returned null — used when a list is non-empty but blind. */
export function explainReceivableParse(fields: Array<number[] | Uint8Array>): string {
  if (fields.length === 0) return 'PushDrop has 0 fields'
  const start = magicIndex(fields)
  if (start < 0) {
    const preview = fields.slice(0, 4).map((field, index) => {
      try {
        const text = fieldUtf8(field)
        if (text.length > 0 && text.length <= 32 && /^[\x20-\x7e]+$/.test(text)) {
          return text
        }
      } catch {
        // Fall through to byte count.
      }
      return `field[${index}] ${Array.from(field).length}B`
    })
    return `magic mismatch (no ${MAGIC}; ${preview.join(', ')})`
  }
  if (start + 7 >= fields.length) {
    return `fields after ${MAGIC} incomplete (${fields.length - start} from magic, need invoice id through memo)`
  }
  try {
    const parsed = payloadFromFields(fields, start)
    return validateReceivable(parsed) ?? 'unknown parse failure'
  } catch (error) {
    return error instanceof Error ? error.message : 'field decode failed'
  }
}

export function validateReceivable(item: ReceivablePayload): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (!INVOICE_ID.test(item.invoiceId)) return 'invalid invoice id'
  const creditor = item.creditor.trim()
  const debtor = item.debtor.trim()
  if (!isPartyIdentity(creditor)) return 'invalid creditor'
  if (!isPartyIdentity(debtor)) return 'invalid debtor'
  if (creditor === debtor) return 'creditor and debtor must differ'
  if (!Number.isInteger(item.amountSats) || item.amountSats < 1) return 'amount must be a positive integer of sats'
  if (!isIsoDate(item.dueDate)) return 'due date must be YYYY-MM-DD'
  if (!STATUSES.includes(item.status)) return 'status must be open, approved, or paid'
  if (item.memo.length > 200) return 'memo too long'
  if (!Number.isInteger(item.advanceBps) || item.advanceBps < 0 || item.advanceBps > 10000) {
    return 'advance bps out of range'
  }
  if (item.status === 'paid' && item.advanceBps !== 0 && item.advanceBps !== ADVANCE_BPS) {
    return 'paid marker has junk advance field'
  }
  return null
}

function sameInvoice(a: ReceivablePayload, b: ReceivablePayload): boolean {
  return (
    a.invoiceId === b.invoiceId &&
    a.creditor === b.creditor &&
    a.debtor === b.debtor &&
    a.amountSats === b.amountSats &&
    a.dueDate === b.dueDate
  )
}

/**
 * Prefer the claimed BRC-29 output index when it carries the billed satoshis;
 * otherwise find any other output with that exact amount (change is usually
 * a different value). Returns -1 when no payment output exists.
 */
export function findPaymentOutputIndex(
  outputSatoshis: number[],
  receivableOutputIndex: number,
  amountSats: number,
  claimedIndex = 1
): number {
  if (
    claimedIndex !== receivableOutputIndex &&
    claimedIndex >= 0 &&
    claimedIndex < outputSatoshis.length &&
    outputSatoshis[claimedIndex] === amountSats
  ) {
    return claimedIndex
  }
  return outputSatoshis.findIndex((sats, index) => index !== receivableOutputIndex && sats === amountSats)
}

/**
 * Stateless overlay admission rules:
 * - register: no previous receipts, N new unique invoice ids
 * - approve: one open → one approved, identity fields preserved
 * - settle: one open|approved → one paid marker plus a same-tx output of amountSats (BRC-29)
 * - advance: one approved unpaid → same approved with 70% advance-intent (no sats moved)
 * Anything else is junk and must not be admitted.
 */
export function classifyReceivableTransaction(
  inputItems: Array<{ index: number; item: ReceivablePayload }>,
  outputItems: Array<{ index: number; item: ReceivablePayload }>,
  outputSatoshis: number[] = []
): Classification {
  const inputs = inputItems.filter(({ item }) => validateReceivable(item) === null)
  const outputs = outputItems.filter(({ item }) => validateReceivable(item) === null)

  if (inputs.length === 0 && outputs.length >= 1) {
    const ids = outputs.map(({ item }) => item.invoiceId)
    if (new Set(ids).size !== ids.length) {
      return { action: 'invalid', admitOutputIndexes: [], reason: 'duplicate invoice ids in register' }
    }
    return {
      action: 'register',
      admitOutputIndexes: outputs.map(({ index }) => index)
    }
  }

  if (inputs.length === 1 && outputs.length === 1) {
    const prev = inputs[0].item
    const next = outputs[0].item
    if (!sameInvoice(prev, next)) {
      return {
        action: 'invalid',
        admitOutputIndexes: [],
        reason: 'state change must preserve invoice identity, parties, amount, and due date'
      }
    }
    if (prev.status === 'paid') {
      return { action: 'invalid', admitOutputIndexes: [], reason: 'already paid' }
    }
    if (prev.status === 'open' && next.status === 'approved') {
      return { action: 'approve', admitOutputIndexes: [outputs[0].index] }
    }
    if ((prev.status === 'open' || prev.status === 'approved') && next.status === 'paid') {
      const payIndex = findPaymentOutputIndex(outputSatoshis, outputs[0].index, next.amountSats)
      if (payIndex < 0) {
        return {
          action: 'invalid',
          admitOutputIndexes: [],
          reason: 'BRC-29 payment output missing or wrong satoshis'
        }
      }
      return { action: 'settle', admitOutputIndexes: [outputs[0].index] }
    }
    if (
      prev.status === 'approved' &&
      next.status === 'approved' &&
      prev.advanceBps === 0 &&
      next.advanceBps === ADVANCE_BPS
    ) {
      return { action: 'advance', admitOutputIndexes: [outputs[0].index] }
    }
    return { action: 'invalid', admitOutputIndexes: [], reason: 'not a valid status transition' }
  }

  return {
    action: 'invalid',
    admitOutputIndexes: [],
    reason: 'not a register, approve, settle, or advance of a receivable'
  }
}

export function isApprovedUnpaid(item: ReceivablePayload): boolean {
  return item.status === 'approved'
}

export function advanceSats(amountSats: number, bps = ADVANCE_BPS): number {
  return Math.floor((amountSats * bps) / 10000)
}
