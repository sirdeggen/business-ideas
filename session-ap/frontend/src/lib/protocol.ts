/**
 * Session AP protocol (PushDrop / BRC-48 fields).
 *
 * Close many small sat spends (or pasted 402-receipt txids) into one session
 * invoice a treasurer can approve, pay once, and export. Not invoices/ — that
 * product is a one-shot payable. MAGIC is unique so ls_anytx client filtering
 * never treats a bsvinvoice (or raffle, grant, …) as a session book.
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'session ap']
export const BASKET = 'session-ap'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MAGIC = 'session ap'
export const SCHEMA_VERSION = '1'
export const BRC29_PROTOCOL_ID: [2, string] = [2, '3241645161d8']
export const MESSAGE_BOX = 'session ap'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'

export const MAX_LABEL_CHARS = 120
export const MAX_LINE_LABEL_CHARS = 160
export const MIN_AMOUNT_SATS = 1
export const MAX_AMOUNT_SATS = 1_000_000_000_000
export const MAX_LINE_ITEMS = 200

export const STATUSES = ['open', 'closed', 'approved', 'paid'] as const
export type SessionStatus = (typeof STATUSES)[number]

export const KINDS = ['session', 'approval', 'payment'] as const
export type SessionKind = (typeof KINDS)[number]

export interface LineItem {
  label: string
  amountSats: number
  amountUsd: string
  receiptHash: string
}

export interface SessionInvoice {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'session'
  sessionId: string
  payerIdentity: string
  payeeIdentity: string
  label: string
  dueDate: string
  createdAt: string
  lineItems: LineItem[]
  totalSats: number
  status: SessionStatus
}

export interface ApprovalAnnouncement {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'approval'
  sessionId: string
  approverIdentity: string
  timestamp: string
}

export interface PaymentAnnouncement {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'payment'
  sessionId: string
  payerIdentity: string
  amountSats: number
  timestamp: string
  remittance: {
    derivationPrefix: string
    derivationSuffix: string
    paymentOutputIndex: number
  }
}

export type SessionAnnouncement = ApprovalAnnouncement | PaymentAnnouncement
export type SessionPayload = SessionInvoice | SessionAnnouncement

export interface IndexedSession {
  invoice: SessionInvoice
  txid: string
  outputIndex: number
}

export interface IndexedAnnouncement {
  announcement: SessionAnnouncement
  txid: string
  outputIndex: number
}

export interface JoinedSession extends SessionInvoice {
  txid: string
  outputIndex: number
  approvalTxid?: string
  paymentTxid?: string
  approvedAt?: string
  paidAt?: string
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

export function isSessionId(value: string): boolean {
  return /^[0-9a-f]{32}$/.test(value)
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function isReceiptHash(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value)
}

export function newSessionId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function assertAmountSats(amountSats: number): void {
  if (!Number.isInteger(amountSats) || amountSats < MIN_AMOUNT_SATS || amountSats > MAX_AMOUNT_SATS) {
    throw new Error(`Amount must be an integer between ${MIN_AMOUNT_SATS} and ${MAX_AMOUNT_SATS} sats`)
  }
}

export function assertLabel(value: string, max = MAX_LABEL_CHARS): void {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Session label is required')
  if (trimmed.length > max) throw new Error(`Label must be at most ${max} characters`)
}

export function hashReceipt(receipt: string): string {
  const trimmed = receipt.trim()
  if (!trimmed) throw new Error('Paste a receipt or transaction id')
  return sha256Hex(trimmed)
}

export function lineItemFromReceipt(input: {
  label: string
  amountSats: number
  amountUsd?: string
  receipt: string
}): LineItem {
  const label = input.label.trim()
  if (!label) throw new Error('Each line needs a label')
  if (label.length > MAX_LINE_LABEL_CHARS) {
    throw new Error(`Line label must be at most ${MAX_LINE_LABEL_CHARS} characters`)
  }
  assertAmountSats(input.amountSats)
  return {
    label,
    amountSats: input.amountSats,
    amountUsd: (input.amountUsd ?? '').trim(),
    receiptHash: hashReceipt(input.receipt)
  }
}

export function rolledUpTotal(lines: LineItem[]): number {
  return lines.reduce((sum, line) => sum + line.amountSats, 0)
}

export function statusRank(status: SessionStatus): number {
  return STATUSES.indexOf(status)
}

export function canAdvance(from: SessionStatus, to: SessionStatus): boolean {
  return statusRank(to) === statusRank(from) + 1
}

export function nextStatus(from: SessionStatus, action: 'close' | 'approve' | 'pay'): SessionStatus {
  const to: SessionStatus = action === 'close' ? 'closed' : action === 'approve' ? 'approved' : 'paid'
  if (!canAdvance(from, to)) {
    throw new Error(`Cannot ${action} a ${from} session`)
  }
  return to
}

export function closeSession(session: SessionInvoice, payeeIdentity: string): SessionInvoice {
  if (!isIdentityKey(payeeIdentity)) throw new Error('Vendor identity is required to close the books')
  if (session.lineItems.length === 0) throw new Error('Add at least one line before closing')
  if (session.lineItems.length > MAX_LINE_ITEMS) throw new Error('Too many line items')
  return {
    ...session,
    payeeIdentity: payeeIdentity.trim(),
    totalSats: rolledUpTotal(session.lineItems),
    status: nextStatus(session.status, 'close')
  }
}

export function applyAnnouncement(
  session: SessionInvoice,
  announcement: SessionAnnouncement
): SessionInvoice {
  if (announcement.magic !== MAGIC) return session
  if (announcement.sessionId !== session.sessionId) return session
  if (announcement.kind === 'approval') {
    if (session.status === 'open') return session
    if (session.status === 'approved' || session.status === 'paid') return session
    return { ...session, status: nextStatus(session.status, 'approve') }
  }
  if (session.status === 'open') return session
  if (session.status === 'paid') return session
  if (session.status === 'closed') {
    return { ...session, status: 'paid' }
  }
  return { ...session, status: nextStatus(session.status, 'pay') }
}

export function applyAnnouncements(
  session: SessionInvoice,
  announcements: SessionAnnouncement[]
): SessionInvoice {
  return announcements.reduce(applyAnnouncement, session)
}

export function isSessionMagic(value: unknown): value is typeof MAGIC {
  return value === MAGIC
}

/** Client-side ls_anytx filter. invoices/ MAGIC and other protocols drop out. */
export function filterSessionPayloads(items: Array<{ magic?: unknown }>): SessionPayload[] {
  return items.filter((item): item is SessionPayload => (
    isSessionMagic(item.magic)
    && (item as SessionPayload).kind != null
    && KINDS.includes((item as SessionPayload).kind)
  ))
}

export function openDraft(input: {
  label: string
  payerIdentity: string
  dueDate: string
  payeeIdentity?: string
}): SessionInvoice {
  assertLabel(input.label)
  if (!isIdentityKey(input.payerIdentity)) {
    throw new Error('Payer identity must be a 66-character account key')
  }
  if (!isIsoDate(input.dueDate)) throw new Error('Due date must be YYYY-MM-DD')
  const payee = (input.payeeIdentity ?? '').trim()
  if (payee && !isIdentityKey(payee)) {
    throw new Error('Vendor identity must be a 66-character account key')
  }
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'session',
    sessionId: newSessionId(),
    payerIdentity: input.payerIdentity.trim(),
    payeeIdentity: payee,
    label: input.label.trim(),
    dueDate: input.dueDate,
    createdAt: new Date().toISOString(),
    lineItems: [],
    totalSats: 0,
    status: 'open'
  }
}

function encodeLineItems(lines: LineItem[]): string {
  return JSON.stringify(lines.map((line) => ({
    label: line.label,
    amountSats: line.amountSats,
    amountUsd: line.amountUsd,
    receiptHash: line.receiptHash
  })))
}

function parseLineItems(raw: string): LineItem[] {
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error('line items')
  return parsed.map((row) => {
    const item = row as Partial<LineItem>
    if (typeof item.label !== 'string' || !item.label.trim()) throw new Error('line label')
    if (!Number.isInteger(item.amountSats)) throw new Error('line amount')
    assertAmountSats(item.amountSats as number)
    if (typeof item.receiptHash !== 'string' || !isReceiptHash(item.receiptHash)) {
      throw new Error('line receipt hash')
    }
    return {
      label: item.label.trim(),
      amountSats: item.amountSats as number,
      amountUsd: typeof item.amountUsd === 'string' ? item.amountUsd : '',
      receiptHash: item.receiptHash
    }
  })
}

export function encodeSessionFields(session: Omit<SessionInvoice, 'magic' | 'version' | 'kind'>): number[][] {
  assertLabel(session.label)
  if (!isSessionId(session.sessionId)) throw new Error('sessionId must be 16 bytes hex')
  if (!isIdentityKey(session.payerIdentity)) throw new Error('payer identity is required')
  if (session.status !== 'open' && !isIdentityKey(session.payeeIdentity)) {
    throw new Error('vendor identity is required')
  }
  if (!isIsoDate(session.dueDate)) throw new Error('dueDate must be YYYY-MM-DD')
  if (session.lineItems.length > MAX_LINE_ITEMS) throw new Error('Too many line items')
  for (const line of session.lineItems) assertAmountSats(line.amountSats)
  const total = rolledUpTotal(session.lineItems)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('session'),
    stringToUtf8Bytes(session.sessionId),
    stringToUtf8Bytes(session.payerIdentity),
    stringToUtf8Bytes(session.payeeIdentity),
    stringToUtf8Bytes(session.label),
    stringToUtf8Bytes(session.dueDate),
    stringToUtf8Bytes(session.createdAt),
    stringToUtf8Bytes(encodeLineItems(session.lineItems)),
    stringToUtf8Bytes(String(total)),
    stringToUtf8Bytes(session.status)
  ]
}

export function encodeApprovalFields(row: Omit<ApprovalAnnouncement, 'magic' | 'version' | 'kind'>): number[][] {
  if (!isSessionId(row.sessionId)) throw new Error('sessionId must be 16 bytes hex')
  if (!isIdentityKey(row.approverIdentity)) throw new Error('approver identity is required')
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('approval'),
    stringToUtf8Bytes(row.sessionId),
    stringToUtf8Bytes(row.approverIdentity),
    stringToUtf8Bytes(row.timestamp)
  ]
}

export function encodePaymentFields(row: Omit<PaymentAnnouncement, 'magic' | 'version' | 'kind'>): number[][] {
  if (!isSessionId(row.sessionId)) throw new Error('sessionId must be 16 bytes hex')
  if (!isIdentityKey(row.payerIdentity)) throw new Error('payer identity is required')
  assertAmountSats(row.amountSats)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('payment'),
    stringToUtf8Bytes(row.sessionId),
    stringToUtf8Bytes(row.payerIdentity),
    stringToUtf8Bytes(String(row.amountSats)),
    stringToUtf8Bytes(row.timestamp),
    stringToUtf8Bytes(JSON.stringify(row.remittance))
  ]
}

export function encodePayloadFields(payload: SessionPayload): number[][] {
  if (payload.kind === 'session') {
    return encodeSessionFields(payload)
  }
  if (payload.kind === 'approval') {
    return encodeApprovalFields(payload)
  }
  return encodePaymentFields(payload)
}

function fieldString(fields: Array<number[] | Uint8Array>, index: number): string {
  return utf8BytesToString(Array.from(fields[index]))
}

export function parseSessionFields(fields: Array<number[] | Uint8Array>): SessionPayload | null {
  if (fields.length < 4) return null
  try {
    const magic = fieldString(fields, 0)
    if (magic !== MAGIC) return null
    const version = fieldString(fields, 1)
    if (version !== SCHEMA_VERSION) return null
    const kind = fieldString(fields, 2)
    if (kind === 'session') {
      if (fields.length < 12) return null
      const sessionId = fieldString(fields, 3)
      const payerIdentity = fieldString(fields, 4)
      const payeeIdentity = fieldString(fields, 5)
      const label = fieldString(fields, 6)
      const dueDate = fieldString(fields, 7)
      const createdAt = fieldString(fields, 8)
      const lineItems = parseLineItems(fieldString(fields, 9))
      const totalSats = Number(fieldString(fields, 10))
      const status = fieldString(fields, 11) as SessionStatus
      if (!isSessionId(sessionId) || !isIdentityKey(payerIdentity) || !isIsoDate(dueDate)) return null
      if (!STATUSES.includes(status)) return null
      assertAmountSats(totalSats || MIN_AMOUNT_SATS)
      return {
        magic: MAGIC,
        version: SCHEMA_VERSION,
        kind: 'session',
        sessionId,
        payerIdentity,
        payeeIdentity,
        label,
        dueDate,
        createdAt,
        lineItems,
        totalSats: rolledUpTotal(lineItems),
        status
      }
    }
    if (kind === 'approval') {
      if (fields.length < 6) return null
      const sessionId = fieldString(fields, 3)
      const approverIdentity = fieldString(fields, 4)
      const timestamp = fieldString(fields, 5)
      if (!isSessionId(sessionId) || !isIdentityKey(approverIdentity)) return null
      return {
        magic: MAGIC,
        version: SCHEMA_VERSION,
        kind: 'approval',
        sessionId,
        approverIdentity,
        timestamp
      }
    }
    if (kind === 'payment') {
      if (fields.length < 8) return null
      const sessionId = fieldString(fields, 3)
      const payerIdentity = fieldString(fields, 4)
      const amountSats = Number(fieldString(fields, 5))
      const timestamp = fieldString(fields, 6)
      const remittance = JSON.parse(fieldString(fields, 7)) as PaymentAnnouncement['remittance']
      if (!isSessionId(sessionId) || !isIdentityKey(payerIdentity)) return null
      assertAmountSats(amountSats)
      return {
        magic: MAGIC,
        version: SCHEMA_VERSION,
        kind: 'payment',
        sessionId,
        payerIdentity,
        amountSats,
        timestamp,
        remittance
      }
    }
    return null
  } catch {
    return null
  }
}

export function joinSessionRecords(
  sessions: IndexedSession[],
  announcements: IndexedAnnouncement[]
): JoinedSession[] {
  const byId = new Map<string, JoinedSession>()
  for (const row of sessions) {
    if (row.invoice.magic !== MAGIC) continue
    if (byId.has(row.invoice.sessionId)) continue
    byId.set(row.invoice.sessionId, {
      ...row.invoice,
      txid: row.txid,
      outputIndex: row.outputIndex
    })
  }

  const grouped = new Map<string, IndexedAnnouncement[]>()
  for (const row of announcements) {
    if (row.announcement.magic !== MAGIC) continue
    const list = grouped.get(row.announcement.sessionId) ?? []
    list.push(row)
    grouped.set(row.announcement.sessionId, list)
  }

  for (const [sessionId, rows] of grouped) {
    const current = byId.get(sessionId)
    if (!current) continue
    let next: SessionInvoice = current
    for (const row of rows) {
      const before = next.status
      next = applyAnnouncement(next, row.announcement)
      if (next.status === before) continue
      if (row.announcement.kind === 'approval') {
        current.approvalTxid = row.txid
        current.approvedAt = row.announcement.timestamp
      } else {
        current.paymentTxid = row.txid
        current.paidAt = row.announcement.timestamp
      }
    }
    byId.set(sessionId, { ...current, ...next })
  }

  return [...byId.values()]
}
