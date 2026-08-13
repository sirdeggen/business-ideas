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

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
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

export function parseReceivableFields(fields: Array<number[] | Uint8Array>): ReceivablePayload | null {
  if (fields.length < 8) return null
  try {
    const asBytes = (field: number[] | Uint8Array): number[] => Array.from(field)
    const magic = utf8BytesToString(asBytes(fields[0]))
    if (magic !== MAGIC) return null
    const invoiceId = utf8BytesToString(asBytes(fields[1]))
    const creditor = utf8BytesToString(asBytes(fields[2]))
    const debtor = utf8BytesToString(asBytes(fields[3]))
    const amountSats = Number(utf8BytesToString(asBytes(fields[4])))
    const dueDate = utf8BytesToString(asBytes(fields[5]))
    const status = utf8BytesToString(asBytes(fields[6])) as ReceivableStatus
    const memo = utf8BytesToString(asBytes(fields[7] ?? []))
    const advanceRaw = fields[8] ? utf8BytesToString(asBytes(fields[8])) : '0'
    const advanceBps = Number(advanceRaw)
    const parsed: ReceivablePayload = {
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
    const reason = validateReceivable(parsed)
    if (reason) return null
    return parsed
  } catch {
    return null
  }
}

export function validateReceivable(item: ReceivablePayload): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (!INVOICE_ID.test(item.invoiceId)) return 'invalid invoice id'
  if (!isIdentityKey(item.creditor)) return 'invalid creditor identity'
  if (!isIdentityKey(item.debtor)) return 'invalid debtor identity'
  if (item.creditor === item.debtor) return 'creditor and debtor must differ'
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
