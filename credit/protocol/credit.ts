/**
 * Credit Desk protocol (PushDrop / BRC-48 fields).
 *
 * A private credit facility secured by existing Invoice (`bsvinvoice`)
 * and Receivable (`receivable`) artifacts. This desk does not issue
 * those artifacts. Collateral is a reference: invoice id, receivable id,
 * receipt outpoint, or overlay txid.
 *
 * Term opens the facility. Draw records principal and the desk fee in
 * bps. Repay pays outstanding down. Default flags a breached unpaid term.
 * Optional underwriting write fee is recorded with the facility.
 *
 * MAGIC `credit`. Public Pages uses tm_anytx / ls_anytx. Client filters
 * on MAGIC. Not a bank, not a lending market, not a yield farm.
 */

export const PROTOCOL_ID: [0, string] = [0, 'credit']
export const BASKET = 'credit'
export const MAGIC = 'credit'
export const SCHEMA_VERSION = '1'
export const BRC29_PROTOCOL_ID: [2, string] = [2, '3241645161d8']
export const MESSAGE_BOX = 'credit'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'

export const INVOICE_MAGIC = 'bsvinvoice'
export const RECEIPT_MAGIC = 'bsvinvoice-paid'
export const RECEIVABLE_MAGIC = 'receivable'

export const BORROWER_MAX = 80
export const NOTE_MAX = 400
export const REASON_MAX = 200
export const COLLATERAL_MAX = 8
export const MIN_SATS = 1
export const MAX_SATS = 1_000_000_000_000
export const TOKEN_SATS = 1
export const DEFAULT_DESK_FEE_BPS = 50
export const MAX_DESK_FEE_BPS = 1_000
export const DEFAULT_UNDERWRITING_FEE_SATS = 100_000
export const DEFAULT_LIMIT_SATS = 10_000_000
export const DEFAULT_TERM_DAYS = 90
export const DEFAULT_BORROWER = 'North mill cloth'
export const DEFAULT_NOTE = 'Seasonal draw against open invoices.'

export const COLLATERAL_KINDS = ['invoice', 'receivable', 'receipt', 'overlay'] as const
export type CollateralKind = (typeof COLLATERAL_KINDS)[number]

export const KINDS = ['term', 'draw', 'repay', 'default'] as const
export type CreditKind = (typeof KINDS)[number]

export type CreditStatus = 'open' | 'drawn' | 'repaid' | 'defaulted'

export interface CollateralRef {
  kind: CollateralKind
  id: string
}

export interface CreditTerm {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'term'
  facilityId: string
  borrower: string
  lenderIdentity: string
  limitSats: number
  maturity: string
  collateral: string
  deskFeeBps: number
  underwritingFeeSats: number
  underwritingNote: string
  openedAt: string
}

export interface CreditDraw {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'draw'
  facilityId: string
  drawId: string
  drawerIdentity: string
  principalSats: number
  feeSats: number
  drawnAt: string
}

export interface CreditRepay {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'repay'
  facilityId: string
  repayId: string
  payerIdentity: string
  amountSats: number
  repaidAt: string
}

export interface CreditDefault {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'default'
  facilityId: string
  flaggerIdentity: string
  reason: string
  flaggedAt: string
}

export type CreditPayload = CreditTerm | CreditDraw | CreditRepay | CreditDefault

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const FACILITY_ID = /^[0-9a-f]{32}$/
const INVOICE_ID = /^[0-9a-fA-F]{32}$/
const RECEIVABLE_ID = /^[A-Za-z0-9._:-]{1,64}$/
const TXID = /^[0-9a-fA-F]{64}$/
const RECEIPT = /^[0-9a-fA-F]{64}\.\d+$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

export function isFacilityId(value: string): boolean {
  return FACILITY_ID.test(value.trim().toLowerCase())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  return !Number.isNaN(new Date(trimmed).getTime())
}

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function utcDate(from = new Date()): string {
  return from.toISOString().slice(0, 10)
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function newFacilityId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function sameIdentity(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function isLender(term: Pick<CreditTerm, 'lenderIdentity'>, identityKey: string): boolean {
  return sameIdentity(term.lenderIdentity, identityKey)
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

export function assertSats(amount: number, label: string): void {
  if (!Number.isInteger(amount) || amount < MIN_SATS || amount > MAX_SATS) {
    throw new Error(`${label} must be a whole number between ${MIN_SATS} and ${MAX_SATS}.`)
  }
}

export function assertOptionalSats(amount: number, label: string): void {
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_SATS) {
    throw new Error(`${label} must be a whole number from 0 to ${MAX_SATS}.`)
  }
}

export function assertBorrower(borrower: string): string {
  const trimmed = borrower.trim().replace(/\s+/g, ' ')
  if (!trimmed) throw new Error('Borrower is required.')
  if (trimmed.length > BORROWER_MAX) {
    throw new Error(`Borrower must be at most ${BORROWER_MAX} characters.`)
  }
  return trimmed
}

export function assertNote(note: string): string {
  const trimmed = note.trim()
  if (trimmed.length > NOTE_MAX) {
    throw new Error(`Underwriting note must be at most ${NOTE_MAX} characters.`)
  }
  return trimmed
}

export function assertReason(reason: string): string {
  const trimmed = reason.trim()
  if (!trimmed) throw new Error('A reason is required.')
  if (trimmed.length > REASON_MAX) {
    throw new Error(`Reason must be at most ${REASON_MAX} characters.`)
  }
  return trimmed
}

export function assertDeskFeeBps(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > MAX_DESK_FEE_BPS) {
    throw new Error(`Desk fee must be a whole number from 0 to ${MAX_DESK_FEE_BPS} bps.`)
  }
}

export function assertMaturity(maturity: string, openedOn?: string): string {
  const trimmed = maturity.trim()
  if (!isIsoDate(trimmed)) throw new Error('Maturity must be a date.')
  if (openedOn && trimmed < openedOn) throw new Error('Maturity must be on or after the open date.')
  return trimmed
}

export function deskFeeSats(principalSats: number, deskFeeBps: number): number {
  assertSats(principalSats, 'Draw')
  assertDeskFeeBps(deskFeeBps)
  return Math.floor((principalSats * deskFeeBps) / 10_000)
}

export function isCollateralKind(value: string): value is CollateralKind {
  return (COLLATERAL_KINDS as readonly string[]).includes(value)
}

function refFromToken(token: string): CollateralRef | null {
  const trimmed = token.trim()
  if (!trimmed) return null
  const splitAt = trimmed.indexOf(':')
  if (splitAt > 0) {
    const kind = trimmed.slice(0, splitAt).toLowerCase()
    const id = trimmed.slice(splitAt + 1).trim()
    if (!isCollateralKind(kind)) return null
    return normalizeRef({ kind, id })
  }
  if (RECEIPT.test(trimmed)) return { kind: 'receipt', id: trimmed.toLowerCase() }
  if (TXID.test(trimmed)) return { kind: 'overlay', id: trimmed.toLowerCase() }
  if (INVOICE_ID.test(trimmed)) return { kind: 'invoice', id: trimmed.toLowerCase() }
  if (RECEIVABLE_ID.test(trimmed)) return { kind: 'receivable', id: trimmed }
  return null
}

function normalizeRef(ref: CollateralRef): CollateralRef | null {
  const id = ref.id.trim()
  if (ref.kind === 'invoice') {
    if (!INVOICE_ID.test(id)) return null
    return { kind: 'invoice', id: id.toLowerCase() }
  }
  if (ref.kind === 'receivable') {
    if (!RECEIVABLE_ID.test(id)) return null
    if (id.toLowerCase() === 'invoice' || id.toLowerCase() === 'receipt') return null
    return { kind: 'receivable', id }
  }
  if (ref.kind === 'receipt') {
    if (!RECEIPT.test(id)) return null
    return { kind: 'receipt', id: id.toLowerCase() }
  }
  if (!TXID.test(id)) return null
  return { kind: 'overlay', id: id.toLowerCase() }
}

export function parseCollateralList(raw: string): CollateralRef[] {
  const tokens = raw.split(/[\s,|]+/).map((part) => part.trim()).filter(Boolean)
  const refs: CollateralRef[] = []
  const seen = new Set<string>()
  for (const token of tokens) {
    const ref = refFromToken(token)
    if (!ref) throw new Error('Use an invoice id, a receivable id, a receipt (txid.vout), or an overlay id.')
    const key = `${ref.kind}:${ref.id}`
    if (seen.has(key)) continue
    seen.add(key)
    refs.push(ref)
  }
  if (refs.length === 0) throw new Error('Collateral is required.')
  if (refs.length > COLLATERAL_MAX) {
    throw new Error(`At most ${COLLATERAL_MAX} collateral references.`)
  }
  return refs
}

export function formatCollateralList(refs: CollateralRef[]): string {
  return refs.map((ref) => `${ref.kind}:${ref.id}`).join('|')
}

export function collateralRefs(encoded: string): CollateralRef[] {
  if (!encoded.trim()) return []
  try {
    return parseCollateralList(encoded)
  } catch {
    return []
  }
}

export function collateralTxid(ref: CollateralRef): string | null {
  if (ref.kind === 'receipt') return ref.id.split('.')[0] ?? null
  if (ref.kind === 'overlay') return ref.id
  return null
}

/** Classify a foreign artifact by MAGIC text. Does not parse invoice or receivable fields. */
export function artifactKindFromTexts(texts: string[]): 'invoice' | 'receipt' | 'receivable' | null {
  if (texts.includes(RECEIPT_MAGIC)) return 'receipt'
  if (texts.includes(INVOICE_MAGIC)) return 'invoice'
  if (texts.includes(RECEIVABLE_MAGIC)) return 'receivable'
  return null
}

export function collateralLabel(ref: CollateralRef): string {
  if (ref.kind === 'invoice') return 'Invoice'
  if (ref.kind === 'receivable') return 'Receivable'
  if (ref.kind === 'receipt') return 'Receipt'
  return 'Overlay'
}

export function outstandingSats(draws: Array<Pick<CreditDraw, 'principalSats'>>, repays: Array<Pick<CreditRepay, 'amountSats'>>): number {
  const drawn = draws.reduce((sum, row) => sum + row.principalSats, 0)
  const repaid = repays.reduce((sum, row) => sum + row.amountSats, 0)
  return Math.max(0, drawn - repaid)
}

export function availableSats(limitSats: number, outstanding: number): number {
  return Math.max(0, limitSats - outstanding)
}

export function facilityStatus(input: {
  term: boolean
  outstanding: number
  drawCount: number
  repayCount: number
  flagged: boolean
}): CreditStatus | null {
  if (!input.term) return null
  if (input.flagged) return 'defaulted'
  if (input.outstanding > 0) return 'drawn'
  if (input.drawCount > 0 || input.repayCount > 0) return 'repaid'
  return 'open'
}

export function termBreached(maturity: string, outstanding: number, asOf = utcDate()): boolean {
  return outstanding > 0 && maturity < asOf
}

export function canDraw(status: CreditStatus | null, maturity: string, available: number, asOf = utcDate()): boolean {
  if (status !== 'open' && status !== 'drawn' && status !== 'repaid') return false
  if (maturity < asOf) return false
  return available >= MIN_SATS
}

export function canRepay(status: CreditStatus | null, outstanding: number): boolean {
  return (status === 'drawn') && outstanding >= MIN_SATS
}

export function canFlagDefault(
  term: Pick<CreditTerm, 'lenderIdentity' | 'maturity'> | null,
  status: CreditStatus | null,
  outstanding: number,
  identityKey: string,
  asOf = utcDate()
): boolean {
  if (!term || status === 'defaulted' || status == null) return false
  if (!isLender(term, identityKey)) return false
  return termBreached(term.maturity, outstanding, asOf)
}

export function validateTerm(term: CreditTerm): string | null {
  if (term.magic !== MAGIC) return 'Not a credit facility.'
  if (term.kind !== 'term') return 'Not a term.'
  if (!isFacilityId(term.facilityId)) return 'Facility id is missing.'
  try {
    assertBorrower(term.borrower)
  } catch (error) {
    return error instanceof Error ? error.message : 'Borrower is invalid.'
  }
  if (!isIdentityKey(term.lenderIdentity)) return 'Lender identity is missing.'
  try {
    assertSats(term.limitSats, 'Limit')
  } catch (error) {
    return error instanceof Error ? error.message : 'Limit is invalid.'
  }
  if (!isIsoDate(term.maturity)) return 'Maturity is missing.'
  try {
    parseCollateralList(term.collateral)
  } catch (error) {
    return error instanceof Error ? error.message : 'Collateral is invalid.'
  }
  try {
    assertDeskFeeBps(term.deskFeeBps)
  } catch (error) {
    return error instanceof Error ? error.message : 'Desk fee is invalid.'
  }
  try {
    assertOptionalSats(term.underwritingFeeSats, 'Underwriting fee')
  } catch (error) {
    return error instanceof Error ? error.message : 'Underwriting fee is invalid.'
  }
  if (term.underwritingNote.length > NOTE_MAX) return 'Underwriting note is too long.'
  if (!isIsoDateTime(term.openedAt)) return 'Opened time is missing.'
  return null
}

export function validateDraw(draw: CreditDraw): string | null {
  if (draw.magic !== MAGIC) return 'Not a credit facility.'
  if (draw.kind !== 'draw') return 'Not a draw.'
  if (!isFacilityId(draw.facilityId)) return 'Facility id is missing.'
  if (!isFacilityId(draw.drawId)) return 'Draw id is missing.'
  if (!isIdentityKey(draw.drawerIdentity)) return 'Drawer identity is missing.'
  try {
    assertSats(draw.principalSats, 'Draw')
  } catch (error) {
    return error instanceof Error ? error.message : 'Draw is invalid.'
  }
  if (!Number.isInteger(draw.feeSats) || draw.feeSats < 0) return 'Desk fee is missing.'
  if (!isIsoDateTime(draw.drawnAt)) return 'Drawn time is missing.'
  return null
}

export function validateRepay(repay: CreditRepay): string | null {
  if (repay.magic !== MAGIC) return 'Not a credit facility.'
  if (repay.kind !== 'repay') return 'Not a repayment.'
  if (!isFacilityId(repay.facilityId)) return 'Facility id is missing.'
  if (!isFacilityId(repay.repayId)) return 'Repay id is missing.'
  if (!isIdentityKey(repay.payerIdentity)) return 'Payer identity is missing.'
  try {
    assertSats(repay.amountSats, 'Repayment')
  } catch (error) {
    return error instanceof Error ? error.message : 'Repayment is invalid.'
  }
  if (!isIsoDateTime(repay.repaidAt)) return 'Repaid time is missing.'
  return null
}

export function validateDefault(flag: CreditDefault): string | null {
  if (flag.magic !== MAGIC) return 'Not a credit facility.'
  if (flag.kind !== 'default') return 'Not a default flag.'
  if (!isFacilityId(flag.facilityId)) return 'Facility id is missing.'
  if (!isIdentityKey(flag.flaggerIdentity)) return 'Flagger identity is missing.'
  try {
    assertReason(flag.reason)
  } catch (error) {
    return error instanceof Error ? error.message : 'Reason is invalid.'
  }
  if (!isIsoDateTime(flag.flaggedAt)) return 'Flagged time is missing.'
  return null
}

export interface TermInput {
  borrower: string
  lenderIdentity: string
  limitSats: number
  maturity: string
  collateral: string
  deskFeeBps: number
  underwritingFeeSats: number
  underwritingNote: string
  openedAt?: string
}

export function assertCanTerm(input: TermInput, asOf = utcDate()): Omit<CreditTerm, 'magic' | 'version' | 'kind' | 'facilityId'> & { collateralRefs: CollateralRef[] } {
  const borrower = assertBorrower(input.borrower)
  if (!isIdentityKey(input.lenderIdentity)) throw new Error('Lender identity is missing.')
  assertSats(input.limitSats, 'Limit')
  const maturity = assertMaturity(input.maturity, asOf)
  const refs = parseCollateralList(input.collateral)
  assertDeskFeeBps(input.deskFeeBps)
  assertOptionalSats(input.underwritingFeeSats, 'Underwriting fee')
  const underwritingNote = assertNote(input.underwritingNote)
  const openedAt = input.openedAt ?? nowIso()
  if (!isIsoDateTime(openedAt)) throw new Error('Opened time is missing.')
  return {
    borrower,
    lenderIdentity: input.lenderIdentity.trim(),
    limitSats: input.limitSats,
    maturity,
    collateral: formatCollateralList(refs),
    collateralRefs: refs,
    deskFeeBps: input.deskFeeBps,
    underwritingFeeSats: input.underwritingFeeSats,
    underwritingNote,
    openedAt
  }
}

export function assertCanDraw(
  term: CreditTerm,
  status: CreditStatus | null,
  outstanding: number,
  principalSats: number,
  asOf = utcDate()
): { principalSats: number, feeSats: number } {
  const room = availableSats(term.limitSats, outstanding)
  if (!canDraw(status, term.maturity, room, asOf)) {
    throw new Error('This facility cannot take a draw.')
  }
  assertSats(principalSats, 'Draw')
  if (principalSats > room) throw new Error('Draw is above the amount still available.')
  return { principalSats, feeSats: deskFeeSats(principalSats, term.deskFeeBps) }
}

export function assertCanRepay(
  status: CreditStatus | null,
  outstanding: number,
  amountSats: number
): number {
  if (!canRepay(status, outstanding)) throw new Error('Nothing is outstanding.')
  assertSats(amountSats, 'Repayment')
  if (amountSats > outstanding) throw new Error('Repayment is above what is outstanding.')
  return amountSats
}

export function assertCanFlagDefault(
  term: CreditTerm,
  status: CreditStatus | null,
  outstanding: number,
  identityKey: string,
  reason: string,
  asOf = utcDate()
): string {
  if (!canFlagDefault(term, status, outstanding, identityKey, asOf)) {
    throw new Error('Default is for a breached term that is still unpaid.')
  }
  return assertReason(reason)
}

function termFromParts(parts: Omit<CreditTerm, 'magic' | 'version' | 'kind'>): CreditTerm | null {
  const term: CreditTerm = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'term', ...parts }
  return validateTerm(term) ? null : term
}

function drawFromParts(parts: Omit<CreditDraw, 'magic' | 'version' | 'kind'>): CreditDraw | null {
  const draw: CreditDraw = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'draw', ...parts }
  return validateDraw(draw) ? null : draw
}

function repayFromParts(parts: Omit<CreditRepay, 'magic' | 'version' | 'kind'>): CreditRepay | null {
  const repay: CreditRepay = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'repay', ...parts }
  return validateRepay(repay) ? null : repay
}

function defaultFromParts(parts: Omit<CreditDefault, 'magic' | 'version' | 'kind'>): CreditDefault | null {
  const flag: CreditDefault = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'default', ...parts }
  return validateDefault(flag) ? null : flag
}

export function encodeTermFields(term: Omit<CreditTerm, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: CreditTerm = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'term', ...term }
  const invalid = validateTerm(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('term'),
    stringToUtf8Bytes(term.facilityId),
    stringToUtf8Bytes(term.borrower),
    stringToUtf8Bytes(term.lenderIdentity),
    stringToUtf8Bytes(String(term.limitSats)),
    stringToUtf8Bytes(term.maturity),
    stringToUtf8Bytes(term.collateral),
    stringToUtf8Bytes(String(term.deskFeeBps)),
    stringToUtf8Bytes(String(term.underwritingFeeSats)),
    stringToUtf8Bytes(term.underwritingNote),
    stringToUtf8Bytes(term.openedAt)
  ]
}

export function encodeDrawFields(draw: Omit<CreditDraw, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: CreditDraw = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'draw', ...draw }
  const invalid = validateDraw(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('draw'),
    stringToUtf8Bytes(draw.facilityId),
    stringToUtf8Bytes(draw.drawId),
    stringToUtf8Bytes(draw.drawerIdentity),
    stringToUtf8Bytes(String(draw.principalSats)),
    stringToUtf8Bytes(String(draw.feeSats)),
    stringToUtf8Bytes(draw.drawnAt)
  ]
}

export function encodeRepayFields(repay: Omit<CreditRepay, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: CreditRepay = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'repay', ...repay }
  const invalid = validateRepay(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('repay'),
    stringToUtf8Bytes(repay.facilityId),
    stringToUtf8Bytes(repay.repayId),
    stringToUtf8Bytes(repay.payerIdentity),
    stringToUtf8Bytes(String(repay.amountSats)),
    stringToUtf8Bytes(repay.repaidAt)
  ]
}

export function encodeDefaultFields(flag: Omit<CreditDefault, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: CreditDefault = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'default', ...flag }
  const invalid = validateDefault(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('default'),
    stringToUtf8Bytes(flag.facilityId),
    stringToUtf8Bytes(flag.flaggerIdentity),
    stringToUtf8Bytes(flag.reason.trim()),
    stringToUtf8Bytes(flag.flaggedAt)
  ]
}

export function parseCreditFields(fields: Array<number[] | Uint8Array>): CreditPayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3) return null
  const version = rest[0]
  const kind = rest[1]
  if (version !== SCHEMA_VERSION) return null
  if (kind === 'term') {
    if (rest.length < 12) return null
    const limitSats = Number(rest[5])
    const deskFeeBps = Number(rest[8])
    const underwritingFeeSats = Number(rest[9])
    if (![limitSats, deskFeeBps, underwritingFeeSats].every(Number.isInteger)) return null
    return termFromParts({
      facilityId: rest[2],
      borrower: rest[3],
      lenderIdentity: rest[4],
      limitSats,
      maturity: rest[6],
      collateral: rest[7],
      deskFeeBps,
      underwritingFeeSats,
      underwritingNote: rest[10],
      openedAt: rest[11]
    })
  }
  if (kind === 'draw') {
    if (rest.length < 8) return null
    const principalSats = Number(rest[5])
    const feeSats = Number(rest[6])
    if (!Number.isInteger(principalSats) || !Number.isInteger(feeSats)) return null
    return drawFromParts({
      facilityId: rest[2],
      drawId: rest[3],
      drawerIdentity: rest[4],
      principalSats,
      feeSats,
      drawnAt: rest[7]
    })
  }
  if (kind === 'repay') {
    if (rest.length < 7) return null
    const amountSats = Number(rest[5])
    if (!Number.isInteger(amountSats)) return null
    return repayFromParts({
      facilityId: rest[2],
      repayId: rest[3],
      payerIdentity: rest[4],
      amountSats,
      repaidAt: rest[6]
    })
  }
  if (kind === 'default') {
    if (rest.length < 6) return null
    return defaultFromParts({
      facilityId: rest[2],
      flaggerIdentity: rest[3],
      reason: rest[4],
      flaggedAt: rest[5]
    })
  }
  return null
}
