/**
 * Scrip Desk protocol (PushDrop / BRC-48 fields).
 *
 * An org issues a branded stored-value balance. Mint and redeem receipts
 * record the units and the basis-point fee. A reserve attestation is a
 * hashed claim the org posts. v0 records and attests. It does not hold
 * custody or move reserves. MAGIC `scrip`. Public Pages uses tm_anytx /
 * ls_anytx. Client filters on MAGIC.
 *
 * Not Treasury (dual-control spending). Not Memberships (a timed access
 * key). Not StreamPay (continuous payment). Not Registry (a unit
 * register). Not Vault Claim (a vaulted item).
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'scrip']
export const BASKET = 'scrip'
export const MAGIC = 'scrip'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'scrip'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'

export const NAME_MAX = 80
export const HOLDER_MAX = 40
export const UNIT_MAX = 40
export const TICKER_MAX = 12
export const MIN_UNITS = 1
export const MAX_UNITS = 9_000_000_000_000
export const MIN_SATS_PER_UNIT = 1
export const MAX_SETUP_FEE_SATS = 9_000_000_000_000_000
export const DEFAULT_SETUP_FEE_SATS = 5_000
export const DEFAULT_MINT_FEE_BPS = 50
export const DEFAULT_REDEEM_FEE_BPS = 25
export const DEFAULT_SATS_PER_UNIT = 1
export const MIN_FEE_BPS = 0
export const MAX_FEE_BPS = 9999
export const RECORD_SATS = 1

export const ISSUED_NOTE = 'Brand issued.'
export const MINTED_NOTE = 'Minted.'
export const ATTESTED_NOTE = 'Reserve attested.'
export const REDEEMED_NOTE = 'Redeemed.'
export const REDEEM_NEEDS_ATTEST = 'Redeem is blocked. There is no reserve attestation yet.'
export const REDEEM_UNDER = 'Redeem is blocked. The attested reserve is below the outstanding liability.'
export const REDEEM_BALANCE = 'Redeem is blocked. That holder does not have those units.'

export const KINDS = ['issue', 'mint', 'attest', 'redeem'] as const
export type ScripKind = (typeof KINDS)[number]

export interface ScripIssue {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'issue'
  scripId: string
  orgName: string
  brandName: string
  ticker: string
  unitLabel: string
  setupFeeSats: number
  mintFeeBps: number
  redeemFeeBps: number
  satsPerUnit: number
  issuedAt: string
}

export interface ScripMint {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'mint'
  scripId: string
  holderName: string
  units: number
  satsPerUnit: number
  satsPaid: number
  mintFeeBps: number
  feeSats: number
  netSats: number
  mintedAt: string
}

export interface ScripAttest {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'attest'
  scripId: string
  reserveSats: number
  outstandingUnits: number
  liabilitySats: number
  attestation: string
  attestedAt: string
}

export interface ScripRedeem {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'redeem'
  scripId: string
  holderName: string
  units: number
  satsPerUnit: number
  grossSats: number
  redeemFeeBps: number
  feeSats: number
  netSats: number
  redeemedAt: string
}

export type ScripPayload = ScripIssue | ScripMint | ScripAttest | ScripRedeem

export interface DeskState {
  issue: ScripIssue | null
  mints: ScripMint[]
  redeems: ScripRedeem[]
  attestations: ScripAttest[]
  rejection: string | null
  notice: string | null
}

export interface IssueInput {
  orgName: string
  brandName: string
  ticker: string
  unitLabel: string
  setupFeeSats: number
  mintFeeBps: number
  redeemFeeBps: number
  satsPerUnit?: number
}

export interface MintLines {
  units: number
  satsPerUnit: number
  satsPaid: number
  feeBps: number
  feeSats: number
  netSats: number
  liabilitySats: number
}

export interface RedeemLines {
  units: number
  satsPerUnit: number
  grossSats: number
  feeBps: number
  feeSats: number
  netSats: number
}

export type CollateralFlag = 'missing' | 'under' | 'covered' | 'over'

export interface Collateral {
  flag: CollateralFlag
  outstandingUnits: number
  liabilitySats: number
  reserveSats: number | null
  attestation: ScripAttest | null
}

export interface BookBrand {
  scripId: string
  issue: ScripIssue
  mints: ScripMint[]
  redeems: ScripRedeem[]
  attestations: ScripAttest[]
}

const SCRIP_ID = /^[0-9a-f]{32}$/
const HASH_HEX = /^[0-9a-f]{64}$/
const TICKER = /^[A-Z0-9]{2,12}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

export function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

export function isScripId(value: string): boolean {
  return SCRIP_ID.test(value.trim().toLowerCase())
}

export function isAttestationHash(value: string): boolean {
  return HASH_HEX.test(value.trim().toLowerCase())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  const date = new Date(trimmed)
  return !Number.isNaN(date.getTime())
}

export function newScripId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function identityFor(label: string): string {
  const digest = sha256Hex(`scrip-desk\n${label.trim().toLowerCase()}`)
  return `02${digest}`
}

export function feeSatsOf(amountSats: number, feeBps: number): number {
  return Math.floor((amountSats * feeBps) / 10_000)
}

export function mintFeeLines(units: number, satsPerUnit: number, feeBps: number): MintLines {
  const satsPaid = units * satsPerUnit
  const feeSats = feeSatsOf(satsPaid, feeBps)
  return {
    units,
    satsPerUnit,
    satsPaid,
    feeBps,
    feeSats,
    netSats: satsPaid - feeSats,
    liabilitySats: satsPaid
  }
}

export function redeemFeeLines(units: number, satsPerUnit: number, feeBps: number): RedeemLines {
  const grossSats = units * satsPerUnit
  const feeSats = feeSatsOf(grossSats, feeBps)
  return {
    units,
    satsPerUnit,
    grossSats,
    feeBps,
    feeSats,
    netSats: grossSats - feeSats
  }
}

export function emptyDesk(): DeskState {
  return {
    issue: null,
    mints: [],
    redeems: [],
    attestations: [],
    rejection: null,
    notice: null
  }
}

export function outstandingUnits(state: Pick<DeskState, 'mints' | 'redeems'>): number {
  const minted = state.mints.reduce((sum, row) => sum + row.units, 0)
  const burned = state.redeems.reduce((sum, row) => sum + row.units, 0)
  return minted - burned
}

export function liabilityOf(state: DeskState): number {
  if (!state.issue) return 0
  return outstandingUnits(state) * state.issue.satsPerUnit
}

export function holderUnits(state: DeskState, holderName: string): number {
  const key = holderName.trim().toLowerCase()
  const minted = state.mints
    .filter((row) => row.holderName.trim().toLowerCase() === key)
    .reduce((sum, row) => sum + row.units, 0)
  const burned = state.redeems
    .filter((row) => row.holderName.trim().toLowerCase() === key)
    .reduce((sum, row) => sum + row.units, 0)
  return minted - burned
}

export function latestAttestation(state: Pick<DeskState, 'attestations'>): ScripAttest | null {
  if (state.attestations.length === 0) return null
  return [...state.attestations].sort((left, right) => {
    if (left.attestedAt === right.attestedAt) return 0
    return left.attestedAt < right.attestedAt ? -1 : 1
  }).at(-1) ?? null
}

export function collateralOf(state: DeskState): Collateral {
  const units = outstandingUnits(state)
  const liability = liabilityOf(state)
  const attestation = latestAttestation(state)
  if (!attestation) {
    return { flag: 'missing', outstandingUnits: units, liabilitySats: liability, reserveSats: null, attestation: null }
  }
  const reserveSats = attestation.reserveSats
  const flag: CollateralFlag = reserveSats < liability ? 'under' : reserveSats > liability ? 'over' : 'covered'
  return { flag, outstandingUnits: units, liabilitySats: liability, reserveSats, attestation }
}

export function coverageBlock(state: DeskState): string | null {
  const flag = collateralOf(state).flag
  if (flag === 'missing') return REDEEM_NEEDS_ATTEST
  if (flag === 'under') return REDEEM_UNDER
  return null
}

export function attestationToken(input: {
  scripId: string
  reserveSats: number
  outstandingUnits: number
  liabilitySats: number
  attestedAt: string
}): string {
  return sha256Hex([
    'scrip',
    'attest',
    input.scripId,
    String(input.reserveSats),
    String(input.outstandingUnits),
    String(input.liabilitySats),
    input.attestedAt
  ].join('\n'))
}

export function attestationMatches(attest: Pick<ScripAttest, 'scripId' | 'reserveSats' | 'outstandingUnits' | 'liabilitySats' | 'attestedAt' | 'attestation'>): boolean {
  return attest.attestation === attestationToken(attest)
}

export function keepMagic<T extends { magic: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.magic === MAGIC)
}

function assertName(name: string, empty: string, max: number): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error(empty)
  if (trimmed.length > max) throw new Error(`Keep the name to ${max} characters.`)
  return trimmed
}

export function assertSetupFee(setupFeeSats: number): void {
  if (!Number.isInteger(setupFeeSats) || setupFeeSats < 0 || setupFeeSats > MAX_SETUP_FEE_SATS) {
    throw new Error('Enter a setup fee in sats.')
  }
}

export function assertFeeBps(feeBps: number): void {
  if (!Number.isInteger(feeBps) || feeBps < MIN_FEE_BPS || feeBps > MAX_FEE_BPS) {
    throw new Error(`Fee must be a whole number of basis points from ${MIN_FEE_BPS} to ${MAX_FEE_BPS}.`)
  }
}

export function assertUnits(units: number): void {
  if (!Number.isInteger(units) || units < MIN_UNITS || units > MAX_UNITS) {
    throw new Error('Enter a whole number of units.')
  }
}

export function assertSatsPerUnit(satsPerUnit: number): void {
  if (!Number.isInteger(satsPerUnit) || satsPerUnit < MIN_SATS_PER_UNIT) {
    throw new Error('Sats per unit must be a whole number.')
  }
}

export function assertReserve(reserveSats: number): void {
  if (!Number.isInteger(reserveSats) || reserveSats < 0 || reserveSats > MAX_SETUP_FEE_SATS) {
    throw new Error('Enter the reserve in sats.')
  }
}

function assertTicker(ticker: string): string {
  const trimmed = ticker.trim().toUpperCase()
  if (!TICKER.test(trimmed)) throw new Error('Ticker must be 2–12 letters or numbers.')
  return trimmed
}

function assertProduct(units: number, satsPerUnit: number): void {
  if (!Number.isSafeInteger(units * satsPerUnit)) throw new Error('That amount is too large.')
}

export function issueBrand(input: IssueInput, now = nowIso(), scripId = newScripId()): DeskState {
  const orgName = assertName(input.orgName, 'Name the org.', NAME_MAX)
  const brandName = assertName(input.brandName, 'Name the brand.', NAME_MAX)
  const unitLabel = assertName(input.unitLabel, 'Name the unit.', UNIT_MAX)
  const ticker = assertTicker(input.ticker)
  assertSetupFee(input.setupFeeSats)
  assertFeeBps(input.mintFeeBps)
  assertFeeBps(input.redeemFeeBps)
  const satsPerUnit = input.satsPerUnit ?? DEFAULT_SATS_PER_UNIT
  assertSatsPerUnit(satsPerUnit)
  if (!isScripId(scripId)) throw new Error('Scrip id is missing.')
  const issue: ScripIssue = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'issue',
    scripId,
    orgName,
    brandName,
    ticker,
    unitLabel,
    setupFeeSats: input.setupFeeSats,
    mintFeeBps: input.mintFeeBps,
    redeemFeeBps: input.redeemFeeBps,
    satsPerUnit,
    issuedAt: now
  }
  const invalid = validateIssue(issue)
  if (invalid) throw new Error(invalid)
  return { ...emptyDesk(), issue, notice: ISSUED_NOTE }
}

function requireIssue(state: DeskState): ScripIssue {
  if (!state.issue) throw new Error('Issue a brand first.')
  return state.issue
}

export function mintUnits(state: DeskState, holderName: string, units: number, now = nowIso()): DeskState {
  const issue = requireIssue(state)
  const holder = assertName(holderName, 'Name the holder.', HOLDER_MAX)
  assertUnits(units)
  assertProduct(units, issue.satsPerUnit)
  const lines = mintFeeLines(units, issue.satsPerUnit, issue.mintFeeBps)
  const mint: ScripMint = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'mint',
    scripId: issue.scripId,
    holderName: holder,
    units,
    satsPerUnit: issue.satsPerUnit,
    satsPaid: lines.satsPaid,
    mintFeeBps: issue.mintFeeBps,
    feeSats: lines.feeSats,
    netSats: lines.netSats,
    mintedAt: now
  }
  const invalid = validateMint(mint)
  if (invalid) throw new Error(invalid)
  return { ...state, mints: [...state.mints, mint], rejection: null, notice: MINTED_NOTE }
}

export function attestReserve(state: DeskState, reserveSats: number, now = nowIso()): DeskState {
  const issue = requireIssue(state)
  assertReserve(reserveSats)
  const units = outstandingUnits(state)
  const liability = liabilityOf(state)
  const attestation = attestationToken({
    scripId: issue.scripId,
    reserveSats,
    outstandingUnits: units,
    liabilitySats: liability,
    attestedAt: now
  })
  const record: ScripAttest = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'attest',
    scripId: issue.scripId,
    reserveSats,
    outstandingUnits: units,
    liabilitySats: liability,
    attestation,
    attestedAt: now
  }
  const invalid = validateAttest(record)
  if (invalid) throw new Error(invalid)
  return { ...state, attestations: [...state.attestations, record], rejection: null, notice: ATTESTED_NOTE }
}

export function redeemUnits(state: DeskState, holderName: string, units: number, now = nowIso()): DeskState {
  const issue = requireIssue(state)
  const holder = holderName.trim()
  const blocked = coverageBlock(state)
  if (blocked) return { ...state, rejection: blocked, notice: null }
  try {
    assertName(holder, 'Name the holder.', HOLDER_MAX)
    assertUnits(units)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Enter a whole number of units.'
    return { ...state, rejection: message, notice: null }
  }
  if (holderUnits(state, holder) < units) {
    return { ...state, rejection: REDEEM_BALANCE, notice: null }
  }
  assertProduct(units, issue.satsPerUnit)
  const lines = redeemFeeLines(units, issue.satsPerUnit, issue.redeemFeeBps)
  const redeem: ScripRedeem = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'redeem',
    scripId: issue.scripId,
    holderName: holder,
    units,
    satsPerUnit: issue.satsPerUnit,
    grossSats: lines.grossSats,
    redeemFeeBps: issue.redeemFeeBps,
    feeSats: lines.feeSats,
    netSats: lines.netSats,
    redeemedAt: now
  }
  const invalid = validateRedeem(redeem)
  if (invalid) throw new Error(invalid)
  return { ...state, redeems: [...state.redeems, redeem], rejection: null, notice: REDEEMED_NOTE }
}

export function validateIssue(issue: ScripIssue): string | null {
  if (issue.magic !== MAGIC || issue.kind !== 'issue') return 'Not a scrip brand.'
  if (issue.version !== SCHEMA_VERSION) return 'Not this scrip version.'
  if (!isScripId(issue.scripId)) return 'Scrip id is missing.'
  if (!issue.orgName.trim() || issue.orgName.length > NAME_MAX) return 'The org name is missing.'
  if (!issue.brandName.trim() || issue.brandName.length > NAME_MAX) return 'The brand name is missing.'
  if (!TICKER.test(issue.ticker)) return 'Ticker is missing.'
  if (!issue.unitLabel.trim() || issue.unitLabel.length > UNIT_MAX) return 'The unit name is missing.'
  try {
    assertSetupFee(issue.setupFeeSats)
    assertFeeBps(issue.mintFeeBps)
    assertFeeBps(issue.redeemFeeBps)
    assertSatsPerUnit(issue.satsPerUnit)
  } catch (error) {
    return error instanceof Error ? error.message : 'Amount is invalid.'
  }
  if (!isIsoDateTime(issue.issuedAt)) return 'Issued time is missing.'
  return null
}

export function validateMint(mint: ScripMint): string | null {
  if (mint.magic !== MAGIC || mint.kind !== 'mint') return 'Not a mint.'
  if (!isScripId(mint.scripId)) return 'Scrip id is missing.'
  if (!mint.holderName.trim() || mint.holderName.length > HOLDER_MAX) return 'Holder is missing.'
  try {
    assertUnits(mint.units)
    assertSatsPerUnit(mint.satsPerUnit)
    assertFeeBps(mint.mintFeeBps)
  } catch (error) {
    return error instanceof Error ? error.message : 'Amount is invalid.'
  }
  const lines = mintFeeLines(mint.units, mint.satsPerUnit, mint.mintFeeBps)
  if (mint.satsPaid !== lines.satsPaid || mint.feeSats !== lines.feeSats || mint.netSats !== lines.netSats) {
    return 'Fee lines do not add up.'
  }
  if (!isIsoDateTime(mint.mintedAt)) return 'Minted time is missing.'
  return null
}

export function validateAttest(attest: ScripAttest): string | null {
  if (attest.magic !== MAGIC || attest.kind !== 'attest') return 'Not an attestation.'
  if (!isScripId(attest.scripId)) return 'Scrip id is missing.'
  try {
    assertReserve(attest.reserveSats)
    if (!Number.isInteger(attest.outstandingUnits) || attest.outstandingUnits < 0) {
      return 'Outstanding units are missing.'
    }
    if (!Number.isInteger(attest.liabilitySats) || attest.liabilitySats < 0) return 'Liability is missing.'
  } catch (error) {
    return error instanceof Error ? error.message : 'Reserve is invalid.'
  }
  if (!isAttestationHash(attest.attestation)) return 'Attestation is missing.'
  if (!attestationMatches(attest)) return 'Attestation does not match this reserve.'
  if (!isIsoDateTime(attest.attestedAt)) return 'Attested time is missing.'
  return null
}

export function validateRedeem(redeem: ScripRedeem): string | null {
  if (redeem.magic !== MAGIC || redeem.kind !== 'redeem') return 'Not a redeem.'
  if (!isScripId(redeem.scripId)) return 'Scrip id is missing.'
  if (!redeem.holderName.trim()) return 'Holder is missing.'
  try {
    assertUnits(redeem.units)
    assertSatsPerUnit(redeem.satsPerUnit)
    assertFeeBps(redeem.redeemFeeBps)
  } catch (error) {
    return error instanceof Error ? error.message : 'Amount is invalid.'
  }
  const lines = redeemFeeLines(redeem.units, redeem.satsPerUnit, redeem.redeemFeeBps)
  if (redeem.grossSats !== lines.grossSats || redeem.feeSats !== lines.feeSats || redeem.netSats !== lines.netSats) {
    return 'Fee lines do not add up.'
  }
  if (!isIsoDateTime(redeem.redeemedAt)) return 'Redeemed time is missing.'
  return null
}

function encodeHead(kind: ScripKind, scripId: string): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes(kind),
    stringToUtf8Bytes(scripId)
  ]
}

export function encodeIssueFields(issue: ScripIssue): number[][] {
  const invalid = validateIssue(issue)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('issue', issue.scripId),
    stringToUtf8Bytes(issue.orgName),
    stringToUtf8Bytes(issue.brandName),
    stringToUtf8Bytes(issue.ticker),
    stringToUtf8Bytes(issue.unitLabel),
    stringToUtf8Bytes(String(issue.setupFeeSats)),
    stringToUtf8Bytes(String(issue.mintFeeBps)),
    stringToUtf8Bytes(String(issue.redeemFeeBps)),
    stringToUtf8Bytes(String(issue.satsPerUnit)),
    stringToUtf8Bytes(issue.issuedAt)
  ]
}

export function encodeMintFields(mint: ScripMint): number[][] {
  const invalid = validateMint(mint)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('mint', mint.scripId),
    stringToUtf8Bytes(mint.holderName),
    stringToUtf8Bytes(String(mint.units)),
    stringToUtf8Bytes(String(mint.satsPerUnit)),
    stringToUtf8Bytes(String(mint.satsPaid)),
    stringToUtf8Bytes(String(mint.mintFeeBps)),
    stringToUtf8Bytes(String(mint.feeSats)),
    stringToUtf8Bytes(String(mint.netSats)),
    stringToUtf8Bytes(mint.mintedAt)
  ]
}

export function encodeAttestFields(attest: ScripAttest): number[][] {
  const invalid = validateAttest(attest)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('attest', attest.scripId),
    stringToUtf8Bytes(String(attest.reserveSats)),
    stringToUtf8Bytes(String(attest.outstandingUnits)),
    stringToUtf8Bytes(String(attest.liabilitySats)),
    stringToUtf8Bytes(attest.attestation),
    stringToUtf8Bytes(attest.attestedAt)
  ]
}

export function encodeRedeemFields(redeem: ScripRedeem): number[][] {
  const invalid = validateRedeem(redeem)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('redeem', redeem.scripId),
    stringToUtf8Bytes(redeem.holderName),
    stringToUtf8Bytes(String(redeem.units)),
    stringToUtf8Bytes(String(redeem.satsPerUnit)),
    stringToUtf8Bytes(String(redeem.grossSats)),
    stringToUtf8Bytes(String(redeem.redeemFeeBps)),
    stringToUtf8Bytes(String(redeem.feeSats)),
    stringToUtf8Bytes(String(redeem.netSats)),
    stringToUtf8Bytes(redeem.redeemedAt)
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

export function parseScripFields(fields: Array<number[] | Uint8Array>): ScripPayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3 || rest[0] !== SCHEMA_VERSION) return null
  const kind = rest[1]
  const scripId = rest[2]
  if (kind === 'issue') {
    if (rest.length < 12) return null
    const setupFeeSats = whole(rest[7])
    const mintFeeBps = whole(rest[8])
    const redeemFeeBps = whole(rest[9])
    const satsPerUnit = whole(rest[10])
    if (setupFeeSats == null || mintFeeBps == null || redeemFeeBps == null || satsPerUnit == null) return null
    const issue: ScripIssue = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'issue',
      scripId,
      orgName: rest[3],
      brandName: rest[4],
      ticker: rest[5],
      unitLabel: rest[6],
      setupFeeSats,
      mintFeeBps,
      redeemFeeBps,
      satsPerUnit,
      issuedAt: rest[11]
    }
    return validateIssue(issue) ? null : issue
  }
  if (kind === 'mint') {
    if (rest.length < 11) return null
    const units = whole(rest[4])
    const satsPerUnit = whole(rest[5])
    const satsPaid = whole(rest[6])
    const mintFeeBps = whole(rest[7])
    const feeSats = whole(rest[8])
    const netSats = whole(rest[9])
    if (units == null || satsPerUnit == null || satsPaid == null || mintFeeBps == null || feeSats == null || netSats == null) {
      return null
    }
    const mint: ScripMint = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'mint',
      scripId,
      holderName: rest[3],
      units,
      satsPerUnit,
      satsPaid,
      mintFeeBps,
      feeSats,
      netSats,
      mintedAt: rest[10]
    }
    return validateMint(mint) ? null : mint
  }
  if (kind === 'attest') {
    if (rest.length < 8) return null
    const reserveSats = whole(rest[3])
    const units = whole(rest[4])
    const liability = whole(rest[5])
    if (reserveSats == null || units == null || liability == null) return null
    const attest: ScripAttest = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'attest',
      scripId,
      reserveSats,
      outstandingUnits: units,
      liabilitySats: liability,
      attestation: rest[6],
      attestedAt: rest[7]
    }
    return validateAttest(attest) ? null : attest
  }
  if (kind === 'redeem') {
    if (rest.length < 11) return null
    const units = whole(rest[4])
    const satsPerUnit = whole(rest[5])
    const grossSats = whole(rest[6])
    const redeemFeeBps = whole(rest[7])
    const feeSats = whole(rest[8])
    const netSats = whole(rest[9])
    if (units == null || satsPerUnit == null || grossSats == null || redeemFeeBps == null || feeSats == null || netSats == null) {
      return null
    }
    const redeem: ScripRedeem = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'redeem',
      scripId,
      holderName: rest[3],
      units,
      satsPerUnit,
      grossSats,
      redeemFeeBps,
      feeSats,
      netSats,
      redeemedAt: rest[10]
    }
    return validateRedeem(redeem) ? null : redeem
  }
  return null
}

export function deskFromRecords(records: ScripPayload[], scripId?: string): DeskState | null {
  const scoped = keepMagic(scripId ? records.filter((row) => row.scripId === scripId) : records)
  const issue = scoped.find((row): row is ScripIssue => row.kind === 'issue') ?? null
  if (!issue) return null
  const mine = scoped.filter((row) => row.scripId === issue.scripId)
  return {
    ...emptyDesk(),
    issue,
    mints: mine.filter((row): row is ScripMint => row.kind === 'mint'),
    redeems: mine.filter((row): row is ScripRedeem => row.kind === 'redeem'),
    attestations: mine.filter((row): row is ScripAttest => row.kind === 'attest')
  }
}

export function bookFromRecords(records: ScripPayload[]): BookBrand[] {
  const issues = keepMagic(records).filter((row): row is ScripIssue => row.kind === 'issue')
  const ids = [...new Set(issues.map((row) => row.scripId))]
  return ids.flatMap((id) => {
    const desk = deskFromRecords(records, id)
    if (!desk?.issue) return []
    return [{
      scripId: id,
      issue: desk.issue,
      mints: desk.mints,
      redeems: desk.redeems,
      attestations: desk.attestations
    }]
  })
}
