/**
 * Check Desk protocol (PushDrop / BRC-48 fields).
 *
 * A pre-flight payee check a wallet or an AP batch run calls before it
 * signs. Flags are reports on an identity key, paymail, or script hash.
 * Every check returns a verdict receipt bound to that payment.
 *
 * v0 is a shared risk lookup plus receipts. It does not move or hold the
 * payment. Reporter stakes and slashing are a local simulation unless they
 * are actually recorded. MAGIC `check`. Public Pages uses tm_anytx /
 * ls_anytx. Client filters on MAGIC.
 *
 * Not Closing (a payee bound inside one closing). Not KYA (who runs an
 * agent). Not Vouch (a general staked attestation). Not Cover (a payout).
 * Not Spend Policy (internal rules).
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'check']
export const BASKET = 'check'
export const MAGIC = 'check'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'check'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'

export const NAME_MAX = 80
export const SUBJECT_MAX = 200
export const NOTE_MAX = 240
export const REF_MAX = 80
export const PREFIX_CHARS = 4
export const SUFFIX_CHARS = 4
export const MAX_EDIT_DISTANCE = 2
export const DEFAULT_CHECK_FEE_SATS = 10
export const DEFAULT_REPORTER_SHARE_BPS = 5_000
export const DEFAULT_FIRST_TIME_THRESHOLD_SATS = 100_000
export const DEFAULT_BATCH_QUOTE_SATS = 50_000
export const DEFAULT_STAKE_SATS = 100
export const MIN_STAKE_SATS = 1
export const MAX_SATS = 9_000_000_000_000_000
export const MAX_FEE_BPS = 10_000
export const RECORD_SATS = 1

export const VERDICTS = ['pass', 'warn', 'block'] as const
export type Verdict = (typeof VERDICTS)[number]

export const SEVERITIES = ['warn', 'block'] as const
export type Severity = (typeof SEVERITIES)[number]

export const SUBJECT_KINDS = ['key', 'paymail', 'script'] as const
export type SubjectKind = (typeof SUBJECT_KINDS)[number]

export const KINDS = ['flag', 'receipt'] as const
export type CheckKind = (typeof KINDS)[number]

export const DEMO_PRIOR_PAYEE = `02${'cd'.repeat(16)}${'ab'.repeat(16)}`
export const DEMO_LOOKALIKE_PAYEE = `02${'cd'.repeat(14)}ffff${'ab'.repeat(16)}`
export const DEMO_VENDOR_PRIOR = 'demo-vendor-10042-acme'
export const DEMO_VENDOR_LOOKALIKE = 'demo-vendor-10999-acme'
export const DEMO_FLAGGED_PAYMAIL = 'wire.swap.demo@example.invalid'
export const DEMO_FIRST_PAYEE = 'harbor-clerk-new-vendor'
export const DEMO_BLOCK_FLAG_ID = 'a1'.repeat(16)
export const DEMO_WARN_FLAG_ID = 'b2'.repeat(16)

export const PASS_REASON = 'No flag, no lookalike, and not a first-time payee above the threshold.'
export const LOOKALIKE_REASON = 'Lookalike of a prior payee.'
export const FIRST_TIME_REASON = 'First-time payee above the threshold.'

const CHECK_ID = /^[0-9a-f]{32}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

export interface CheckFlag {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'flag'
  flagId: string
  reporterName: string
  subjectKind: SubjectKind
  subject: string
  severity: Severity
  note: string
  stakeSats: number
  demo: boolean
  flaggedAt: string
}

export interface CheckReceipt {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'receipt'
  checkId: string
  payee: string
  amountSats: number
  payerRef: string
  verdict: Verdict
  reason: string
  consultedFlagIds: string[]
  citedFlagIds: string[]
  lookalikeOf: string
  receiptHash: string
  checkFeeSats: number
  reporterShareBps: number
  reporterShareSats: number
  stopped: boolean
  reporterName: string
  checkedAt: string
}

export type CheckPayload = CheckFlag | CheckReceipt

export interface CheckInput {
  payee: string
  amountSats: number
  payerRef: string
  priorPayees: string[]
  flags: CheckFlag[]
  checkFeeSats?: number
  reporterShareBps?: number
  firstTimeThresholdSats?: number
}

export interface VendorRow {
  line: number
  payee: string
  amountSats: number
  payerRef: string
}

export interface FlagInput {
  reporterName: string
  subjectKind: SubjectKind
  subject: string
  severity: Severity
  note: string
  stakeSats: number
  demo?: boolean
}

export function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

export function isCheckId(value: string): boolean {
  return CHECK_ID.test(value.trim().toLowerCase())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  const date = new Date(trimmed)
  return !Number.isNaN(date.getTime())
}

export function newCheckId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function normalizePayee(value: string): string {
  return value.trim().toLowerCase()
}

export function identityFor(label: string): string {
  const digest = sha256Hex(`check-desk\n${label.trim().toLowerCase()}`)
  return `02${digest}`
}

export function reporterShareOf(checkFeeSats: number, shareBps: number): number {
  return Math.floor((checkFeeSats * shareBps) / 10_000)
}

export function editDistance(left: string, right: string): number {
  const rows = left.length
  const cols = right.length
  if (rows === 0) return cols
  if (cols === 0) return rows
  let prev = Array.from({ length: cols + 1 }, (_, index) => index)
  let curr = new Array<number>(cols + 1).fill(0)
  for (let i = 1; i <= rows; i++) {
    curr[0] = i
    const code = left.charCodeAt(i - 1)
    for (let j = 1; j <= cols; j++) {
      const cost = code === right.charCodeAt(j - 1) ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    const swap = prev
    prev = curr
    curr = swap
  }
  return prev[cols]
}

export function lookalikeOf(payee: string, priorPayees: string[]): { prior: string, distance: number } | null {
  const candidate = normalizePayee(payee)
  if (candidate.length < PREFIX_CHARS) return null
  let best: { prior: string, distance: number } | null = null
  for (const prior of priorPayees) {
    const other = normalizePayee(prior)
    if (!other || other === candidate || other.length < PREFIX_CHARS) continue
    const distance = editDistance(candidate, other)
    const poisoning = candidate.slice(0, PREFIX_CHARS) === other.slice(0, PREFIX_CHARS)
      && candidate.slice(-SUFFIX_CHARS) === other.slice(-SUFFIX_CHARS)
    const near = distance > 0 && distance <= MAX_EDIT_DISTANCE
    if (!poisoning && !near) continue
    if (!best || distance < best.distance) best = { prior: other, distance }
  }
  return best
}

export function keepMagic<T extends { magic: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.magic === MAGIC)
}

function assertSats(value: number, label: string, min = 0): void {
  if (!Number.isInteger(value) || value < min || value > MAX_SATS) {
    throw new Error(`Enter ${label} in sats.`)
  }
}

function assertBps(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_FEE_BPS) {
    throw new Error('Reporter share must be a whole number of basis points from 0 to 10000.')
  }
}

function assertText(value: string, empty: string, max: number): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(empty)
  if (trimmed.length > max) throw new Error(`Keep it to ${max} characters.`)
  return trimmed
}

export function receiptToken(input: {
  payee: string
  amountSats: number
  payerRef: string
  verdict: Verdict
  consultedFlagIds: string[]
  checkedAt: string
}): string {
  return sha256Hex([
    'check',
    'receipt',
    normalizePayee(input.payee),
    String(input.amountSats),
    input.payerRef.trim(),
    input.verdict,
    [...input.consultedFlagIds].sort().join(','),
    input.checkedAt
  ].join('\n'))
}

export function receiptMatches(receipt: Pick<CheckReceipt, 'payee' | 'amountSats' | 'payerRef' | 'verdict' | 'consultedFlagIds' | 'checkedAt' | 'receiptHash'>): boolean {
  return receipt.receiptHash === receiptToken(receipt)
}

function flagReason(flags: CheckFlag[]): string {
  const names = [...new Set(flags.map((flag) => flag.reporterName))].join(', ')
  const note = flags[0]?.note ?? ''
  return note ? `Flagged by ${names}. ${note}` : `Flagged by ${names}.`
}

export function judgePayee(input: CheckInput): {
  verdict: Verdict
  reason: string
  consultedFlagIds: string[]
  citedFlagIds: string[]
  lookalikeOf: string
} {
  const payee = normalizePayee(input.payee)
  if (!payee) throw new Error('Enter the payee.')
  if (payee.length > SUBJECT_MAX) throw new Error(`Keep the payee to ${SUBJECT_MAX} characters.`)
  assertSats(input.amountSats, 'the amount')
  const payerRef = input.payerRef.trim()
  if (payerRef.length > REF_MAX) throw new Error(`Keep the payer ref to ${REF_MAX} characters.`)
  const threshold = input.firstTimeThresholdSats ?? DEFAULT_FIRST_TIME_THRESHOLD_SATS
  assertSats(threshold, 'the first-time threshold')
  const valid = input.flags.filter((flag) => validateFlag(flag) === null)
  const consultedFlagIds = [...new Set(valid.map((flag) => flag.flagId))].sort()
  const cited = valid.filter((flag) => normalizePayee(flag.subject) === payee)
  const citedFlagIds = [...new Set(cited.map((flag) => flag.flagId))].sort()
  if (cited.some((flag) => flag.severity === 'block') || cited.some((flag) => flag.severity === 'warn')) {
    const blocks = cited.filter((flag) => flag.severity === 'block')
    const verdict: Verdict = blocks.length > 0 ? 'block' : 'warn'
    const citedForReason = blocks.length > 0 ? blocks : cited
    return {
      verdict,
      reason: flagReason(citedForReason),
      consultedFlagIds,
      citedFlagIds,
      lookalikeOf: ''
    }
  }
  const like = lookalikeOf(payee, input.priorPayees)
  if (like) {
    return {
      verdict: 'warn',
      reason: LOOKALIKE_REASON,
      consultedFlagIds,
      citedFlagIds,
      lookalikeOf: like.prior
    }
  }
  const known = input.priorPayees.some((prior) => normalizePayee(prior) === payee)
  if (!known && input.amountSats > threshold) {
    return {
      verdict: 'warn',
      reason: FIRST_TIME_REASON,
      consultedFlagIds,
      citedFlagIds,
      lookalikeOf: ''
    }
  }
  return {
    verdict: 'pass',
    reason: PASS_REASON,
    consultedFlagIds,
    citedFlagIds,
    lookalikeOf: ''
  }
}

export function runCheck(input: CheckInput, now = nowIso(), checkId = newCheckId()): CheckReceipt {
  const checkFeeSats = input.checkFeeSats ?? DEFAULT_CHECK_FEE_SATS
  const reporterShareBps = input.reporterShareBps ?? DEFAULT_REPORTER_SHARE_BPS
  assertSats(checkFeeSats, 'the check fee')
  assertBps(reporterShareBps)
  if (!isCheckId(checkId)) throw new Error('Check id is missing.')
  const judged = judgePayee(input)
  const receipt: CheckReceipt = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'receipt',
    checkId: checkId.toLowerCase(),
    payee: normalizePayee(input.payee),
    amountSats: input.amountSats,
    payerRef: input.payerRef.trim(),
    verdict: judged.verdict,
    reason: judged.reason,
    consultedFlagIds: judged.consultedFlagIds,
    citedFlagIds: judged.citedFlagIds,
    lookalikeOf: judged.lookalikeOf,
    receiptHash: '',
    checkFeeSats,
    reporterShareBps,
    reporterShareSats: 0,
    stopped: false,
    reporterName: '',
    checkedAt: now
  }
  receipt.receiptHash = receiptToken(receipt)
  const invalid = validateReceipt(receipt)
  if (invalid) throw new Error(invalid)
  return receipt
}

export function creditStop(receipt: CheckReceipt, flags: CheckFlag[]): CheckReceipt {
  if (receipt.verdict === 'pass') throw new Error('A pass does not credit a reporter.')
  if (receipt.citedFlagIds.length === 0) throw new Error('No flag was cited.')
  if (receipt.stopped) return receipt
  const cited = flags.filter((flag) => receipt.citedFlagIds.includes(flag.flagId))
  const chosen = cited.find((flag) => flag.severity === 'block') ?? cited[0]
  if (!chosen) throw new Error('No flag was cited.')
  const next: CheckReceipt = {
    ...receipt,
    stopped: true,
    reporterName: chosen.reporterName,
    reporterShareSats: reporterShareOf(receipt.checkFeeSats, receipt.reporterShareBps)
  }
  const invalid = validateReceipt(next)
  if (invalid) throw new Error(invalid)
  return next
}

export function fileFlag(input: FlagInput, now = nowIso(), flagId = newCheckId()): CheckFlag {
  const flag: CheckFlag = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'flag',
    flagId: flagId.toLowerCase(),
    reporterName: assertText(input.reporterName, 'Name the reporter.', NAME_MAX),
    subjectKind: input.subjectKind,
    subject: normalizePayee(assertText(input.subject, 'Enter the key, paymail, or script.', SUBJECT_MAX)),
    severity: input.severity,
    note: assertText(input.note, 'Add a short note.', NOTE_MAX),
    stakeSats: input.stakeSats,
    demo: input.demo === true,
    flaggedAt: now
  }
  const invalid = validateFlag(flag)
  if (invalid) throw new Error(invalid)
  return flag
}

export function validateFlag(flag: CheckFlag): string | null {
  if (flag.magic !== MAGIC || flag.kind !== 'flag') return 'Not a check flag.'
  if (flag.version !== SCHEMA_VERSION) return 'Not this check version.'
  if (!isCheckId(flag.flagId)) return 'Flag id is missing.'
  if (!flag.reporterName.trim() || flag.reporterName.length > NAME_MAX) return 'Reporter is missing.'
  if (!SUBJECT_KINDS.includes(flag.subjectKind)) return 'Subject kind is missing.'
  if (!flag.subject.trim() || flag.subject.length > SUBJECT_MAX) return 'Subject is missing.'
  if (flag.subject !== normalizePayee(flag.subject)) return 'Subject is not normalized.'
  if (!SEVERITIES.includes(flag.severity)) return 'Severity is missing.'
  if (!flag.note.trim() || flag.note.length > NOTE_MAX) return 'Note is missing.'
  try {
    assertSats(flag.stakeSats, 'the stake', MIN_STAKE_SATS)
  } catch (error) {
    return error instanceof Error ? error.message : 'Stake is invalid.'
  }
  if (typeof flag.demo !== 'boolean') return 'Demo mark is missing.'
  if (!isIsoDateTime(flag.flaggedAt)) return 'Flagged time is missing.'
  return null
}

export function validateReceipt(receipt: CheckReceipt): string | null {
  if (receipt.magic !== MAGIC || receipt.kind !== 'receipt') return 'Not a check receipt.'
  if (receipt.version !== SCHEMA_VERSION) return 'Not this check version.'
  if (!isCheckId(receipt.checkId)) return 'Check id is missing.'
  if (!receipt.payee.trim() || receipt.payee !== normalizePayee(receipt.payee)) return 'Payee is missing.'
  if (!VERDICTS.includes(receipt.verdict)) return 'Verdict is missing.'
  if (!receipt.reason.trim()) return 'Reason is missing.'
  if (!Array.isArray(receipt.consultedFlagIds) || !Array.isArray(receipt.citedFlagIds)) return 'Flags are missing.'
  if (receipt.citedFlagIds.some((id) => !receipt.consultedFlagIds.includes(id))) return 'A cited flag was not consulted.'
  if (receipt.consultedFlagIds.some((id) => !isCheckId(id))) return 'Flag id is missing.'
  try {
    assertSats(receipt.amountSats, 'the amount')
    assertSats(receipt.checkFeeSats, 'the check fee')
    assertBps(receipt.reporterShareBps)
    assertSats(receipt.reporterShareSats, 'the reporter share')
  } catch (error) {
    return error instanceof Error ? error.message : 'Amount is invalid.'
  }
  const expectedShare = receipt.stopped
    ? reporterShareOf(receipt.checkFeeSats, receipt.reporterShareBps)
    : 0
  if (receipt.reporterShareSats !== expectedShare) return 'Reporter share does not match the fee.'
  if (receipt.stopped && receipt.citedFlagIds.length === 0) return 'A stop needs a cited flag.'
  if (receipt.stopped && !receipt.reporterName.trim()) return 'Reporter is missing.'
  if (!receipt.stopped && receipt.reporterName.trim()) return 'Reporter share is not credited yet.'
  if (receipt.payerRef.length > REF_MAX) return 'Payer ref is too long.'
  if (!receiptMatches(receipt)) return 'Receipt hash does not match this payment.'
  if (!isIsoDateTime(receipt.checkedAt)) return 'Checked time is missing.'
  return null
}

function encodeHead(kind: CheckKind, id: string): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes(kind),
    stringToUtf8Bytes(id)
  ]
}

export function encodeFlagFields(flag: CheckFlag): number[][] {
  const invalid = validateFlag(flag)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('flag', flag.flagId),
    stringToUtf8Bytes(flag.reporterName),
    stringToUtf8Bytes(flag.subjectKind),
    stringToUtf8Bytes(flag.subject),
    stringToUtf8Bytes(flag.severity),
    stringToUtf8Bytes(flag.note),
    stringToUtf8Bytes(String(flag.stakeSats)),
    stringToUtf8Bytes(flag.demo ? '1' : '0'),
    stringToUtf8Bytes(flag.flaggedAt)
  ]
}

export function encodeReceiptFields(receipt: CheckReceipt): number[][] {
  const invalid = validateReceipt(receipt)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('receipt', receipt.checkId),
    stringToUtf8Bytes(receipt.payee),
    stringToUtf8Bytes(String(receipt.amountSats)),
    stringToUtf8Bytes(receipt.payerRef),
    stringToUtf8Bytes(receipt.verdict),
    stringToUtf8Bytes(receipt.reason),
    stringToUtf8Bytes(receipt.consultedFlagIds.join(',')),
    stringToUtf8Bytes(receipt.citedFlagIds.join(',')),
    stringToUtf8Bytes(receipt.lookalikeOf),
    stringToUtf8Bytes(receipt.receiptHash),
    stringToUtf8Bytes(String(receipt.checkFeeSats)),
    stringToUtf8Bytes(String(receipt.reporterShareBps)),
    stringToUtf8Bytes(String(receipt.reporterShareSats)),
    stringToUtf8Bytes(receipt.stopped ? '1' : '0'),
    stringToUtf8Bytes(receipt.reporterName),
    stringToUtf8Bytes(receipt.checkedAt)
  ]
}

function isPrintableUtf8(bytes: number[]): boolean {
  return bytes.length > 0 && bytes.every((byte) => byte >= 0x09 && byte <= 0x7e)
}

function looksLikeLockPadding(field: number[] | Uint8Array): boolean {
  const bytes = Array.from(field)
  if (isPrintableUtf8(bytes)) return false
  if (bytes.length === 33 && (bytes[0] === 2 || bytes[0] === 3)) return true
  if (bytes.length >= 64 && bytes.length <= 80) return true
  return false
}

function semanticFields(fields: Array<number[] | Uint8Array>): Array<number[] | Uint8Array> {
  return fields.filter((field) => !looksLikeLockPadding(field))
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

function whole(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function idList(value: string): string[] | null {
  if (!value) return []
  const ids = value.split(',')
  if (ids.some((id) => !isCheckId(id))) return null
  return ids
}

export function parseCheckFields(fields: Array<number[] | Uint8Array>): CheckPayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3 || rest[0] !== SCHEMA_VERSION) return null
  const kind = rest[1]
  const id = rest[2]
  if (kind === 'flag') {
    if (rest.length < 11) return null
    const stakeSats = whole(rest[8])
    if (stakeSats == null) return null
    if (rest[4] !== 'key' && rest[4] !== 'paymail' && rest[4] !== 'script') return null
    if (rest[6] !== 'warn' && rest[6] !== 'block') return null
    if (rest[9] !== '0' && rest[9] !== '1') return null
    const flag: CheckFlag = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'flag',
      flagId: id,
      reporterName: rest[3],
      subjectKind: rest[4],
      subject: rest[5],
      severity: rest[6],
      note: rest[7],
      stakeSats,
      demo: rest[9] === '1',
      flaggedAt: rest[10]
    }
    return validateFlag(flag) ? null : flag
  }
  if (kind === 'receipt') {
    if (rest.length < 18) return null
    const amountSats = whole(rest[4])
    const consulted = idList(rest[8])
    const cited = idList(rest[9])
    const checkFeeSats = whole(rest[12])
    const reporterShareBps = whole(rest[13])
    const reporterShareSats = whole(rest[14])
    if (
      amountSats == null || consulted == null || cited == null
      || checkFeeSats == null || reporterShareBps == null || reporterShareSats == null
    ) return null
    if (rest[6] !== 'pass' && rest[6] !== 'warn' && rest[6] !== 'block') return null
    if (rest[15] !== '0' && rest[15] !== '1') return null
    const receipt: CheckReceipt = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'receipt',
      checkId: id,
      payee: rest[3],
      amountSats,
      payerRef: rest[5],
      verdict: rest[6],
      reason: rest[7],
      consultedFlagIds: consulted,
      citedFlagIds: cited,
      lookalikeOf: rest[10],
      receiptHash: rest[11],
      checkFeeSats,
      reporterShareBps,
      reporterShareSats,
      stopped: rest[15] === '1',
      reporterName: rest[16],
      checkedAt: rest[17]
    }
    return validateReceipt(receipt) ? null : receipt
  }
  return null
}

export function flagsFromRecords(records: CheckPayload[]): CheckFlag[] {
  return keepMagic(records).filter((row): row is CheckFlag => row.kind === 'flag')
}

export function receiptsFromRecords(records: CheckPayload[]): CheckReceipt[] {
  return keepMagic(records).filter((row): row is CheckReceipt => row.kind === 'receipt')
}

function splitCsv(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

export function parseVendorCsv(text: string): { rows: VendorRow[], errors: string[] } {
  const rows: VendorRow[] = []
  const errors: string[] = []
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  let payeeIdx = 0
  let amountIdx = 1
  let refIdx = 2
  let headerSeen = false
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index] ?? ''
    if (!raw.trim()) continue
    const cells = splitCsv(raw)
    const line = index + 1
    if (!headerSeen) {
      const header = cells.map((cell) => cell.trim().toLowerCase())
      if (header.includes('payee')) {
        headerSeen = true
        payeeIdx = header.indexOf('payee')
        amountIdx = header.findIndex((cell) => cell === 'amount' || cell === 'amount_sats' || cell === 'sats')
        refIdx = header.findIndex((cell) => cell === 'payerref' || cell === 'payer_ref' || cell === 'ref' || cell === 'reference')
        if (amountIdx < 0) errors.push(`Line ${line}: amount column is missing.`)
        continue
      }
      headerSeen = true
    }
    const payee = (cells[payeeIdx] ?? '').trim()
    const amountRaw = (cells[amountIdx] ?? '').trim().replace(/,/g, '')
    const payerRef = refIdx >= 0 ? (cells[refIdx] ?? '').trim() : ''
    if (!payee) {
      errors.push(`Line ${line}: payee is missing.`)
      continue
    }
    if (!/^\d+$/.test(amountRaw)) {
      errors.push(`Line ${line}: amount must be whole sats.`)
      continue
    }
    rows.push({ line, payee, amountSats: Number(amountRaw), payerRef })
  }
  return { rows, errors }
}

export function runBatch(
  rows: VendorRow[],
  shared: Omit<CheckInput, 'payee' | 'amountSats' | 'payerRef'>,
  now = nowIso()
): CheckReceipt[] {
  return rows.map((row) => runCheck({
    ...shared,
    payee: row.payee,
    amountSats: row.amountSats,
    payerRef: row.payerRef
  }, now))
}

export const SEED_FLAGS: CheckFlag[] = [
  fileFlag({
    reporterName: 'Northwind Demo Books',
    subjectKind: 'paymail',
    subject: DEMO_FLAGGED_PAYMAIL,
    severity: 'block',
    note: 'Demo data. A fictional books desk reported this paymail after a swapped vendor detail in a walkthrough.',
    stakeSats: DEFAULT_STAKE_SATS,
    demo: true
  }, '2026-10-01T12:00:00Z', DEMO_BLOCK_FLAG_ID),
  fileFlag({
    reporterName: 'Harbor Demo Treasury',
    subjectKind: 'key',
    subject: DEMO_LOOKALIKE_PAYEE,
    severity: 'warn',
    note: 'Demo data. A fictional treasury reported this key after a lookalike payment in a walkthrough.',
    stakeSats: DEFAULT_STAKE_SATS,
    demo: true
  }, '2026-10-01T12:05:00Z', DEMO_WARN_FLAG_ID)
]
