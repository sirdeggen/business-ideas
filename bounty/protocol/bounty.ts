/**
 * Bounty Desk protocol (PushDrop / BRC-48 fields).
 *
 * A project funds a severity-tiered pool. A researcher posts a hash of
 * the report. A triage verdict pays the matching tier. MAGIC `bounty`.
 * Public Pages uses tm_anytx / ls_anytx. Client filters on MAGIC.
 *
 * Script-enforced: the pool output is a PushDrop lock only the project
 * key can spend. Desk-state: which tier matches, hash priority, and the
 * append-only disclosure timeline. The report body is never a field.
 * The export is a record of those timestamps, not legal advice.
 *
 * Not Job Escrow (one hired job). Not Grants (a purpose-bound gift).
 * Not Cover (an insurance claim). Not Vouch (a staked attestation).
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'bounty']
export const BASKET = 'bounty'
export const MAGIC = 'bounty'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'bounty'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'

export const TIERS = ['critical', 'high', 'medium', 'low'] as const
export type Tier = (typeof TIERS)[number]

export const STAGES = ['received', 'acknowledged', 'fixed', 'disclosed'] as const
export type Stage = (typeof STAGES)[number]

export const KINDS = ['fund', 'submit', 'verdict', 'timeline'] as const
export type BountyKind = (typeof KINDS)[number]

export const NAME_MAX = 80
export const SCOPE_MAX = 280
export const REPORT_MAX = 8_000
export const MIN_SATS = 0
export const MAX_SATS = 9_000_000_000_000
export const DEFAULT_PAYOUT_FEE_BPS = 800
export const MAX_PAYOUT_FEE_BPS = 999
export const DEFAULT_SUBMISSION_FEE_SATS = 1_000
export const DEFAULT_EXPORT_FEE_SATS = 2_500
export const RECORD_SATS = 1

export const EARLY_WARNING_MS = 24 * 60 * 60 * 1000
export const FULL_NOTICE_MS = 72 * 60 * 60 * 1000
export const FINAL_REPORT_MS = 14 * 24 * 60 * 60 * 1000

export const EXPORT_NOTE =
  'This export is a desk record of timestamps. It is not legal compliance advice. The report body is not in this record.'

export type DutyFlag = 'open' | 'on-time' | 'late'

export interface TierAmounts {
  critical: number
  high: number
  medium: number
  low: number
}

export interface BountyFund {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'fund'
  bountyId: string
  projectName: string
  scope: string
  tiers: TierAmounts
  poolSats: number
  payoutFeeBps: number
  submissionFeeSats: number
  exportFeeSats: number
  projectIdentity: string
  fundedAt: string
}

export interface BountySubmit {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'submit'
  bountyId: string
  researcherName: string
  reportHash: string
  submissionFeeSats: number
  submittedAt: string
}

export interface BountyVerdict {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'verdict'
  bountyId: string
  tier: Tier
  tierSats: number
  payoutFeeBps: number
  feeSats: number
  researcherSats: number
  poolLeft: number
  reportHash: string
  releasedAt: string
}

export interface TimelineEvent {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'timeline'
  bountyId: string
  stage: Stage
  at: string
}

export type BountyPayload = BountyFund | BountySubmit | BountyVerdict | TimelineEvent

export interface DeskState {
  fund: BountyFund | null
  submission: BountySubmit | null
  verdict: BountyVerdict | null
  timeline: TimelineEvent[]
  exportText: string | null
  rejection: string | null
  notice: string | null
}

export interface FundInput {
  projectName: string
  scope: string
  tiers: TierAmounts
  payoutFeeBps: number
  submissionFeeSats: number
  exportFeeSats: number
  projectIdentity?: string
}

export interface ReleaseLines {
  tierSats: number
  payoutFeeBps: number
  feeSats: number
  researcherSats: number
  poolLeft: number
  projectLockSats: number
}

export interface RecordPlan {
  poolLockSats: number
  researcherSats: number
  receipts: Array<'fund' | 'submit' | 'verdict' | 'timeline'>
}

export interface Duties {
  earlyWarning: DutyFlag
  fullNotice: DutyFlag
  finalReport: DutyFlag
}

const BOUNTY_ID = /^[0-9a-f]{32}$/
const HASH_HEX = /^[0-9a-f]{64}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/

export function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

export function isBountyId(value: string): boolean {
  return BOUNTY_ID.test(value.trim().toLowerCase())
}

export function isReportHash(value: string): boolean {
  return HASH_HEX.test(value.trim().toLowerCase())
}

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  return !Number.isNaN(new Date(trimmed).getTime())
}

export function isTier(value: string): value is Tier {
  return (TIERS as readonly string[]).includes(value)
}

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value)
}

export function newBountyId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function emptyDesk(): DeskState {
  return {
    fund: null,
    submission: null,
    verdict: null,
    timeline: [],
    exportText: null,
    rejection: null,
    notice: null
  }
}

export function hashReport(body: string): string {
  return sha256Hex(body)
}

export function keepMagic<T extends { magic: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.magic === MAGIC)
}

function assertText(value: string, empty: string, max: number): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(empty)
  if (trimmed.length > max) throw new Error(`Keep it to ${max} characters.`)
  if (/[\r\n]/.test(trimmed)) throw new Error('Keep that on one line.')
  return trimmed
}

function assertSats(value: number, label: string, min = MIN_SATS): void {
  if (!Number.isInteger(value) || value < min || value > MAX_SATS) {
    throw new Error(`Enter ${label} in sats.`)
  }
}

export function assertPayoutFeeBps(payoutFeeBps: number): void {
  if (!Number.isInteger(payoutFeeBps) || payoutFeeBps < 0 || payoutFeeBps > MAX_PAYOUT_FEE_BPS) {
    throw new Error('Payout fee must stay under 10%.')
  }
}

export function poolOf(tiers: TierAmounts): number {
  let total = 0
  for (const tier of TIERS) {
    assertSats(tiers[tier], `${tier} tier`, 0)
    total += tiers[tier]
  }
  if (total < 1) throw new Error('Fund at least one tier.')
  if (!Number.isSafeInteger(total)) throw new Error('That pool is too large.')
  return total
}

/** Basis-point floor. 800 is 8%, which is under a 10% project fee. */
export function payoutFeeSats(tierSats: number, payoutFeeBps: number): number {
  assertSats(tierSats, 'the tier', 1)
  assertPayoutFeeBps(payoutFeeBps)
  return Math.floor((tierSats * payoutFeeBps) / 10_000)
}

/**
 * The whole tier leaves the open pool. The desk fee is withheld from
 * that tier, so the researcher receives tier minus fee. The withheld
 * fee stays inside the project lock with the unreleased tiers.
 */
export function releaseLines(poolSats: number, tierSats: number, payoutFeeBps: number): ReleaseLines {
  assertSats(poolSats, 'the pool', 1)
  const feeSats = payoutFeeSats(tierSats, payoutFeeBps)
  if (tierSats > poolSats) throw new Error('That tier is larger than the pool.')
  const researcherSats = tierSats - feeSats
  if (researcherSats < 1) throw new Error('The desk fee leaves nothing for the researcher.')
  const poolLeft = poolSats - tierSats
  return {
    tierSats,
    payoutFeeBps,
    feeSats,
    researcherSats,
    poolLeft,
    projectLockSats: poolLeft + feeSats
  }
}

export function submissionFeeDue(fund: Pick<BountyFund, 'submissionFeeSats'>): number {
  return fund.submissionFeeSats
}

export function exportFeeDue(fund: Pick<BountyFund, 'exportFeeSats'>): number {
  return fund.exportFeeSats
}

export function earlierSubmission(rows: BountySubmit[]): BountySubmit | null {
  if (rows.length === 0) return null
  return [...rows].sort((left, right) => {
    if (left.submittedAt < right.submittedAt) return -1
    if (left.submittedAt > right.submittedAt) return 1
    if (left.reportHash < right.reportHash) return -1
    if (left.reportHash > right.reportHash) return 1
    return 0
  })[0] ?? null
}

export function fundPool(input: FundInput, now = nowIso(), bountyId = newBountyId()): DeskState {
  const projectName = assertText(input.projectName, 'Name the project.', NAME_MAX)
  const scope = assertText(input.scope, 'Name the scope.', SCOPE_MAX)
  const tiers = {
    critical: input.tiers.critical,
    high: input.tiers.high,
    medium: input.tiers.medium,
    low: input.tiers.low
  }
  const poolSats = poolOf(tiers)
  assertPayoutFeeBps(input.payoutFeeBps)
  assertSats(input.submissionFeeSats, 'the submission fee', 1)
  assertSats(input.exportFeeSats, 'the export fee', 1)
  const projectIdentity = (input.projectIdentity ?? '').trim()
  if (projectIdentity && !isIdentityKey(projectIdentity)) {
    throw new Error('Project key must be a compressed public key.')
  }
  if (!isIsoDateTime(now)) throw new Error('Funded time is missing.')
  const fund: BountyFund = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'fund',
    bountyId,
    projectName,
    scope,
    tiers,
    poolSats,
    payoutFeeBps: input.payoutFeeBps,
    submissionFeeSats: input.submissionFeeSats,
    exportFeeSats: input.exportFeeSats,
    projectIdentity,
    fundedAt: now
  }
  return {
    ...emptyDesk(),
    fund,
    notice: 'Pool funded in this browser. Nothing is on-chain until you record.'
  }
}

export function submitReport(
  desk: DeskState,
  input: { researcherName: string, reportBody: string, at?: string }
): DeskState {
  if (!desk.fund) throw new Error('Fund a pool first.')
  if (desk.submission) throw new Error('A report hash is already posted on this pool.')
  const researcherName = assertText(input.researcherName, 'Name the researcher.', NAME_MAX)
  const reportBody = input.reportBody
  if (!reportBody.trim()) throw new Error('Write the report. It stays off the chain.')
  if (reportBody.length > REPORT_MAX) throw new Error(`Keep the report to ${REPORT_MAX} characters.`)
  const submittedAt = input.at ?? nowIso()
  if (!isIsoDateTime(submittedAt)) throw new Error('Submitted time is missing.')
  const reportHash = hashReport(reportBody)
  const submission: BountySubmit = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'submit',
    bountyId: desk.fund.bountyId,
    researcherName,
    reportHash,
    submissionFeeSats: desk.fund.submissionFeeSats,
    submittedAt
  }
  const timeline = appendTimeline([], 'received', submittedAt, desk.fund.bountyId)
  return {
    ...desk,
    submission,
    timeline,
    verdict: null,
    exportText: null,
    rejection: null,
    notice: 'Hash posted. Send the full report over Message Box. The body is not on-chain.'
  }
}

export function releaseTier(desk: DeskState, tier: Tier, at = nowIso()): DeskState {
  if (!desk.fund) throw new Error('Fund a pool first.')
  if (!desk.submission) throw new Error('Post a report hash before a verdict.')
  if (desk.verdict) throw new Error('This pool already released a tier.')
  if (!isTier(tier)) throw new Error('Pick a tier.')
  const tierSats = desk.fund.tiers[tier]
  if (tierSats < 1) throw new Error('That tier is empty.')
  if (!isIsoDateTime(at)) throw new Error('Released time is missing.')
  const lines = releaseLines(desk.fund.poolSats, tierSats, desk.fund.payoutFeeBps)
  const verdict: BountyVerdict = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'verdict',
    bountyId: desk.fund.bountyId,
    tier,
    tierSats: lines.tierSats,
    payoutFeeBps: lines.payoutFeeBps,
    feeSats: lines.feeSats,
    researcherSats: lines.researcherSats,
    poolLeft: lines.poolLeft,
    reportHash: desk.submission.reportHash,
    releasedAt: at
  }
  return {
    ...desk,
    verdict,
    exportText: null,
    rejection: null,
    notice: 'Verdict released the tier. The timeline is still a desk record.'
  }
}

export function nextStage(events: TimelineEvent[]): Stage | null {
  return STAGES[events.length] ?? null
}

export function appendTimeline(
  events: TimelineEvent[],
  stage: Stage,
  at: string,
  bountyId: string
): TimelineEvent[] {
  const expected = nextStage(events)
  if (!expected) throw new Error('The timeline is already complete.')
  if (stage !== expected) throw new Error(`Next is ${expected}.`)
  if (!isIsoDateTime(at)) throw new Error('Time is missing.')
  if (!isBountyId(bountyId)) throw new Error('Bounty id is missing.')
  const previous = events[events.length - 1]
  if (previous && at < previous.at) {
    throw new Error('A later step cannot be earlier than the one before it.')
  }
  return [
    ...events,
    {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'timeline',
      bountyId,
      stage,
      at
    }
  ]
}

export function appendStage(desk: DeskState, stage: Stage, at = nowIso()): DeskState {
  if (!desk.fund) throw new Error('Fund a pool first.')
  if (!desk.submission && stage === 'received') throw new Error('Post a report hash first.')
  const timeline = appendTimeline(desk.timeline, stage, at, desk.fund.bountyId)
  return {
    ...desk,
    timeline,
    exportText: null,
    rejection: null,
    notice: `${stage} added.`
  }
}

export function dutyFlag(start: string | null, end: string | null, windowMs: number): DutyFlag {
  if (!start || !end) return 'open'
  const delta = Date.parse(end) - Date.parse(start)
  if (!Number.isFinite(delta) || delta < 0) return 'late'
  return delta <= windowMs ? 'on-time' : 'late'
}

export function dutiesOf(events: TimelineEvent[]): Duties {
  const at = (stage: Stage): string | null => events.find((event) => event.stage === stage)?.at ?? null
  const received = at('received')
  const acknowledged = at('acknowledged')
  return {
    earlyWarning: dutyFlag(received, acknowledged, EARLY_WARNING_MS),
    fullNotice: dutyFlag(received, acknowledged, FULL_NOTICE_MS),
    finalReport: dutyFlag(at('fixed'), at('disclosed'), FINAL_REPORT_MS)
  }
}

export function formatExport(desk: DeskState): string {
  if (!desk.fund) throw new Error('Fund a pool first.')
  if (!desk.submission) throw new Error('Post a report hash first.')
  const duties = dutiesOf(desk.timeline)
  const lines = [
    'Bounty Desk disclosure record',
    `bounty: ${desk.fund.bountyId}`,
    `project: ${desk.fund.projectName}`,
    `scope: ${desk.fund.scope}`,
    `report-hash: ${desk.submission.reportHash}`,
    `tier: ${desk.verdict?.tier ?? 'none'}`,
    `tier-sats: ${desk.verdict?.tierSats ?? 0}`,
    `desk-fee-sats: ${desk.verdict?.feeSats ?? 0}`,
    `researcher-sats: ${desk.verdict?.researcherSats ?? 0}`,
    `pool-left-sats: ${desk.verdict?.poolLeft ?? desk.fund.poolSats}`,
    `submission-fee-sats: ${desk.fund.submissionFeeSats}`,
    `export-fee-sats: ${desk.fund.exportFeeSats}`,
    'timeline:'
  ]
  for (const event of desk.timeline) lines.push(`${event.stage} ${event.at}`)
  lines.push(
    'duties:',
    `early-warning-24h ${duties.earlyWarning}`,
    `full-notice-72h ${duties.fullNotice}`,
    `final-report-14d ${duties.finalReport}`,
    `note: ${EXPORT_NOTE}`
  )
  return lines.join('\n')
}

export function exportTimeline(desk: DeskState): DeskState {
  const exportText = formatExport(desk)
  return {
    ...desk,
    exportText,
    rejection: null,
    notice: 'Export ready. This is a record, not legal advice.'
  }
}

export function recordPlan(desk: DeskState): RecordPlan {
  if (!desk.fund) throw new Error('Fund a pool first.')
  const poolLockSats = desk.verdict
    ? desk.verdict.poolLeft + desk.verdict.feeSats
    : desk.fund.poolSats
  const researcherSats = desk.verdict?.researcherSats ?? 0
  if (poolLockSats + researcherSats !== desk.fund.poolSats) {
    throw new Error('Release lines do not add up to the pool.')
  }
  const receipts: RecordPlan['receipts'] = ['fund']
  if (desk.submission) receipts.push('submit')
  if (desk.verdict) receipts.push('verdict')
  for (const _event of desk.timeline) receipts.push('timeline')
  return { poolLockSats, researcherSats, receipts }
}

export function publicPayloads(desk: DeskState): BountyPayload[] {
  if (!desk.fund) return []
  const rows: BountyPayload[] = [desk.fund]
  if (desk.submission) rows.push(desk.submission)
  if (desk.verdict) rows.push(desk.verdict)
  return rows.concat(desk.timeline)
}

function foldTimeline(events: TimelineEvent[], bountyId: string): TimelineEvent[] {
  const sorted = [...events].sort((left, right) => {
    if (left.at < right.at) return -1
    if (left.at > right.at) return 1
    return 0
  })
  const kept: TimelineEvent[] = []
  for (const event of sorted) {
    if (event.bountyId !== bountyId) continue
    if (event.stage !== STAGES[kept.length]) continue
    const previous = kept[kept.length - 1]
    if (previous && event.at < previous.at) continue
    kept.push(event)
  }
  return kept
}

export function deskFromRecords(rows: BountyPayload[], bountyId?: string): DeskState | null {
  const scoped = keepMagic(rows).filter((row) => !bountyId || row.bountyId === bountyId)
  const fund = scoped.find((row): row is BountyFund => row.kind === 'fund')
  if (!fund) return null
  const submits = scoped.filter((row): row is BountySubmit => row.kind === 'submit')
  const verdict = scoped.find((row): row is BountyVerdict => row.kind === 'verdict') ?? null
  return {
    fund,
    submission: earlierSubmission(submits),
    verdict,
    timeline: foldTimeline(
      scoped.filter((row): row is TimelineEvent => row.kind === 'timeline'),
      fund.bountyId
    ),
    exportText: null,
    rejection: null,
    notice: null
  }
}

export interface ListedPool {
  bountyId: string
  fund: BountyFund
  submission: BountySubmit | null
  verdict: BountyVerdict | null
}

export function bookFromRecords(rows: BountyPayload[]): ListedPool[] {
  const funds = keepMagic(rows).filter((row): row is BountyFund => row.kind === 'fund')
  const seen = new Set<string>()
  const book: ListedPool[] = []
  for (const fund of funds) {
    if (seen.has(fund.bountyId)) continue
    seen.add(fund.bountyId)
    const desk = deskFromRecords(rows, fund.bountyId)
    if (!desk?.fund) continue
    book.push({
      bountyId: fund.bountyId,
      fund: desk.fund,
      submission: desk.submission,
      verdict: desk.verdict
    })
  }
  return book
}

function encodeHead(kind: BountyKind, bountyId: string): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes(kind),
    stringToUtf8Bytes(bountyId)
  ]
}

export function validateFund(fund: BountyFund): string | null {
  if (fund.magic !== MAGIC || fund.kind !== 'fund') return 'Not a bounty pool.'
  if (!isBountyId(fund.bountyId)) return 'Bounty id is missing.'
  if (!fund.projectName.trim() || !fund.scope.trim()) return 'Project or scope is missing.'
  try {
    const pool = poolOf(fund.tiers)
    if (pool !== fund.poolSats) return 'Pool total does not match the tiers.'
    assertPayoutFeeBps(fund.payoutFeeBps)
    assertSats(fund.submissionFeeSats, 'the submission fee', 1)
    assertSats(fund.exportFeeSats, 'the export fee', 1)
  } catch (error) {
    return error instanceof Error ? error.message : 'Pool is invalid.'
  }
  if (fund.projectIdentity && !isIdentityKey(fund.projectIdentity)) return 'Project key is invalid.'
  if (!isIsoDateTime(fund.fundedAt)) return 'Funded time is missing.'
  return null
}

export function validateSubmit(submit: BountySubmit): string | null {
  if (submit.magic !== MAGIC || submit.kind !== 'submit') return 'Not a submission.'
  if (!isBountyId(submit.bountyId)) return 'Bounty id is missing.'
  if (!submit.researcherName.trim()) return 'Researcher is missing.'
  if (!isReportHash(submit.reportHash)) return 'Report hash is missing.'
  try {
    assertSats(submit.submissionFeeSats, 'the submission fee', 1)
  } catch (error) {
    return error instanceof Error ? error.message : 'Submission fee is invalid.'
  }
  if (!isIsoDateTime(submit.submittedAt)) return 'Submitted time is missing.'
  return null
}

export function validateVerdict(verdict: BountyVerdict): string | null {
  if (verdict.magic !== MAGIC || verdict.kind !== 'verdict') return 'Not a verdict.'
  if (!isBountyId(verdict.bountyId)) return 'Bounty id is missing.'
  if (!isTier(verdict.tier)) return 'Tier is missing.'
  if (!isReportHash(verdict.reportHash)) return 'Report hash is missing.'
  if (!isIsoDateTime(verdict.releasedAt)) return 'Released time is missing.'
  try {
    const lines = releaseLines(verdict.poolLeft + verdict.tierSats, verdict.tierSats, verdict.payoutFeeBps)
    if (
      lines.feeSats !== verdict.feeSats
      || lines.researcherSats !== verdict.researcherSats
      || lines.poolLeft !== verdict.poolLeft
    ) {
      return 'Release lines do not add up.'
    }
  } catch (error) {
    return error instanceof Error ? error.message : 'Release is invalid.'
  }
  return null
}

export function validateTimeline(event: TimelineEvent): string | null {
  if (event.magic !== MAGIC || event.kind !== 'timeline') return 'Not a timeline event.'
  if (!isBountyId(event.bountyId)) return 'Bounty id is missing.'
  if (!isStage(event.stage)) return 'Stage is missing.'
  if (!isIsoDateTime(event.at)) return 'Event time is missing.'
  return null
}

export function encodeFundFields(fund: BountyFund): number[][] {
  const invalid = validateFund(fund)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('fund', fund.bountyId),
    stringToUtf8Bytes(fund.projectName),
    stringToUtf8Bytes(fund.scope),
    stringToUtf8Bytes(String(fund.tiers.critical)),
    stringToUtf8Bytes(String(fund.tiers.high)),
    stringToUtf8Bytes(String(fund.tiers.medium)),
    stringToUtf8Bytes(String(fund.tiers.low)),
    stringToUtf8Bytes(String(fund.poolSats)),
    stringToUtf8Bytes(String(fund.payoutFeeBps)),
    stringToUtf8Bytes(String(fund.submissionFeeSats)),
    stringToUtf8Bytes(String(fund.exportFeeSats)),
    stringToUtf8Bytes(fund.projectIdentity || 'pending'),
    stringToUtf8Bytes(fund.fundedAt)
  ]
}

export function encodeSubmitFields(submit: BountySubmit): number[][] {
  const invalid = validateSubmit(submit)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('submit', submit.bountyId),
    stringToUtf8Bytes(submit.researcherName),
    stringToUtf8Bytes(submit.reportHash),
    stringToUtf8Bytes(String(submit.submissionFeeSats)),
    stringToUtf8Bytes(submit.submittedAt)
  ]
}

export function encodeVerdictFields(verdict: BountyVerdict): number[][] {
  const invalid = validateVerdict(verdict)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('verdict', verdict.bountyId),
    stringToUtf8Bytes(verdict.tier),
    stringToUtf8Bytes(String(verdict.tierSats)),
    stringToUtf8Bytes(String(verdict.payoutFeeBps)),
    stringToUtf8Bytes(String(verdict.feeSats)),
    stringToUtf8Bytes(String(verdict.researcherSats)),
    stringToUtf8Bytes(String(verdict.poolLeft)),
    stringToUtf8Bytes(verdict.reportHash),
    stringToUtf8Bytes(verdict.releasedAt)
  ]
}

export function encodeTimelineFields(event: TimelineEvent): number[][] {
  const invalid = validateTimeline(event)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('timeline', event.bountyId),
    stringToUtf8Bytes(event.stage),
    stringToUtf8Bytes(event.at)
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

export function parseBountyFields(fields: Array<number[] | Uint8Array>): BountyPayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3 || rest[0] !== SCHEMA_VERSION) return null
  const kind = rest[1]
  const bountyId = rest[2] ?? ''
  if (kind === 'fund') {
    if (rest.length < 15) return null
    const critical = whole(rest[5] ?? '')
    const high = whole(rest[6] ?? '')
    const medium = whole(rest[7] ?? '')
    const low = whole(rest[8] ?? '')
    const poolSats = whole(rest[9] ?? '')
    const payoutFeeBps = whole(rest[10] ?? '')
    const submissionFeeSats = whole(rest[11] ?? '')
    const exportFeeSats = whole(rest[12] ?? '')
    if (
      critical == null || high == null || medium == null || low == null
      || poolSats == null || payoutFeeBps == null || submissionFeeSats == null || exportFeeSats == null
    ) return null
    const fund: BountyFund = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'fund',
      bountyId,
      projectName: rest[3] ?? '',
      scope: rest[4] ?? '',
      tiers: { critical, high, medium, low },
      poolSats,
      payoutFeeBps,
      submissionFeeSats,
      exportFeeSats,
      projectIdentity: (rest[13] ?? '') === 'pending' ? '' : (rest[13] ?? ''),
      fundedAt: rest[14] ?? ''
    }
    return validateFund(fund) ? null : fund
  }
  if (kind === 'submit') {
    if (rest.length < 7) return null
    const submissionFeeSats = whole(rest[5] ?? '')
    if (submissionFeeSats == null) return null
    const submit: BountySubmit = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'submit',
      bountyId,
      researcherName: rest[3] ?? '',
      reportHash: rest[4] ?? '',
      submissionFeeSats,
      submittedAt: rest[6] ?? ''
    }
    return validateSubmit(submit) ? null : submit
  }
  if (kind === 'verdict') {
    if (rest.length < 11) return null
    const tierSats = whole(rest[4] ?? '')
    const payoutFeeBps = whole(rest[5] ?? '')
    const feeSats = whole(rest[6] ?? '')
    const researcherSats = whole(rest[7] ?? '')
    const poolLeft = whole(rest[8] ?? '')
    if (tierSats == null || payoutFeeBps == null || feeSats == null || researcherSats == null || poolLeft == null) {
      return null
    }
    const tier = rest[3] ?? ''
    if (!isTier(tier)) return null
    const verdict: BountyVerdict = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'verdict',
      bountyId,
      tier,
      tierSats,
      payoutFeeBps,
      feeSats,
      researcherSats,
      poolLeft,
      reportHash: rest[9] ?? '',
      releasedAt: rest[10] ?? ''
    }
    return validateVerdict(verdict) ? null : verdict
  }
  if (kind === 'timeline') {
    if (rest.length < 5) return null
    const stage = rest[3] ?? ''
    if (!isStage(stage)) return null
    const event: TimelineEvent = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'timeline',
      bountyId,
      stage,
      at: rest[4] ?? ''
    }
    return validateTimeline(event) ? null : event
  }
  return null
}
