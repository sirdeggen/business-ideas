/**
 * Closing Desk protocol (PushDrop / BRC-48 fields).
 *
 * One purchase receipt. The payee is named when the buyer opens it.
 * A unilateral payee swap is rejected. A change needs M-of-N party
 * approvals and may carry a flat amendment fee. A deed hash and a
 * seller attestation sit on the receipt. The release receipt is written
 * only after M-of-N release approvals, and those approvals do not carry
 * over a payee change. A payee change stays flagged because the first
 * payee and the current payee are both on the record. v0 records and
 * attests; it does not move funds. The fee is basis points
 * of the amount (default 100). MAGIC `closing`. Public Pages uses
 * tm_anytx / ls_anytx. Client filters on MAGIC.
 *
 * Not the job desk (labor milestones). Not Handoff Desk (a secondary
 * ownership marketplace).
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'closing']
export const BASKET = 'closing'
export const MAGIC = 'closing'
export const SCHEMA_VERSION = '1'
export const BRC29_PROTOCOL_ID: [2, string] = [2, '3241645161d8']
export const MESSAGE_BOX = 'closing'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'

export const LABEL_MAX = 80
export const NAME_MAX = 40
export const DOC_LABEL_MAX = 120
export const MIN_AMOUNT_SATS = 1
export const MAX_AMOUNT_SATS = 9_000_000_000_000_000
export const DEFAULT_FEE_BPS = 100
export const MIN_FEE_BPS = 0
export const MAX_FEE_BPS = 9999
export const RECORD_SATS = 1

export const PAYEE_BOUND = 'Payee bound.'
export const PAYEE_CHANGED = 'The parties approved the new payee. The receipt flags that change.'
export const SWAP_REJECTED = 'Rejected. The payee stays bound until the parties approve a change.'
export const ALREADY_PAYEE = 'That is already the payee.'
export const HASH_MATCH = 'Hash matches.'
export const HASH_MISMATCH = 'Hash does not match.'
export const ATTESTED = 'The seller attested this deed hash.'
export const ATTEST_MATCH = 'Attestation matches.'
export const ATTEST_MISMATCH = 'Attestation does not match this hash.'
export const RELEASED_NOTE = 'Released.'
export const NEED_DEED = 'Attach the deed first.'
export const NEED_ATTEST = 'The seller still needs to attest.'
export const NEED_APPROVALS = 'The parties still need to approve.'
export const NEED_NAME = 'Name the new payee first.'
export const NEED_HASH_MATCH = 'The deed hash does not match.'

export const ROLES = ['buyer', 'seller', 'agent'] as const
export type PartyRole = (typeof ROLES)[number]

export const KINDS = ['open', 'deed', 'attest', 'swap', 'approve', 'release'] as const
export type ClosingKind = (typeof KINDS)[number]

export const PURPOSES = ['payee', 'release'] as const
export type ApprovalPurpose = (typeof PURPOSES)[number]

export interface ClosingOpen {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'open'
  closingId: string
  label: string
  amountSats: number
  feeBps: number
  amendmentFeeSats: number
  payeeIdentity: string
  payeeName: string
  originalPayeeIdentity: string
  originalPayeeName: string
  buyerIdentity: string
  buyerName: string
  agentIdentity: string
  agentName: string
  threshold: number
  createdAt: string
}

export interface ClosingDeed {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'deed'
  closingId: string
  docHash: string
  docLabel: string
  attachedAt: string
}

export interface ClosingAttest {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'attest'
  closingId: string
  docHash: string
  sellerIdentity: string
  attestation: string
  attestedAt: string
}

export interface ClosingSwap {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'swap'
  closingId: string
  proposedIdentity: string
  proposedName: string
  rejectedAt: string
}

export interface ClosingApprove {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'approve'
  closingId: string
  purpose: ApprovalPurpose
  role: PartyRole
  approvedAt: string
}

export interface ClosingRelease {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'release'
  closingId: string
  payeeIdentity: string
  payeeName: string
  amountSats: number
  feeBps: number
  feeSats: number
  amendmentFeeSats: number
  netSats: number
  docHash: string
  attestation: string
  swapRejected: '0' | '1'
  releasedAt: string
}

export type ClosingPayload =
  | ClosingOpen
  | ClosingDeed
  | ClosingAttest
  | ClosingSwap
  | ClosingApprove
  | ClosingRelease

export interface PartyRow {
  role: PartyRole
  name: string
}

export interface FeeLines {
  amountSats: number
  feeBps: number
  feeSats: number
  amendmentFeeSats: number
  netSats: number
}

export interface PayeeProposal {
  name: string
  identity: string
}

export type HashStatus = 'none' | 'match' | 'mismatch'

export interface DeskState {
  open: ClosingOpen | null
  deed: ClosingDeed | null
  attestation: ClosingAttest | null
  proposal: PayeeProposal | null
  payeeApprovals: PartyRole[]
  releaseApprovals: PartyRole[]
  released: ClosingRelease | null
  hashStatus: HashStatus
  rejection: string | null
  notice: string | null
  amendmentApplied: boolean
  sawSwapRejection: boolean
}

export interface OpenInput {
  label: string
  amountSats: number
  feeBps: number
  amendmentFeeSats: number
  sellerName: string
  sellerIdentity?: string
  includeAgent: boolean
  agentName?: string
  agentIdentity?: string
  buyerName?: string
  buyerIdentity?: string
}

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const CLOSING_ID = /^[0-9a-f]{32}$/
const HASH_HEX = /^[0-9a-f]{64}$/
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

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

export function isClosingId(value: string): boolean {
  return CLOSING_ID.test(value.trim().toLowerCase())
}

export function isDocHash(value: string): boolean {
  return HASH_HEX.test(value.trim().toLowerCase())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  const date = new Date(trimmed)
  return !Number.isNaN(date.getTime())
}

export function isRole(value: string): value is PartyRole {
  return (ROLES as readonly string[]).includes(value)
}

export function isPurpose(value: string): value is ApprovalPurpose {
  return (PURPOSES as readonly string[]).includes(value)
}

export function newClosingId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function identityFor(label: string): string {
  const digest = sha256Hex(`closing-desk\n${label.trim().toLowerCase()}`)
  return `02${digest}`
}

export function sameIdentity(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function quorumSize(partyCount: number): number {
  if (partyCount < 2) throw new Error('A closing needs a buyer and a seller.')
  return 2
}

export function feeSatsOf(amountSats: number, feeBps: number): number {
  return Math.floor((amountSats * feeBps) / 10_000)
}

export function feeLines(input: {
  amountSats: number
  feeBps: number
  amendmentFeeSats?: number
}): FeeLines {
  const amendmentFeeSats = input.amendmentFeeSats ?? 0
  const feeSats = feeSatsOf(input.amountSats, input.feeBps)
  return {
    amountSats: input.amountSats,
    feeBps: input.feeBps,
    feeSats,
    amendmentFeeSats,
    netSats: input.amountSats - feeSats - amendmentFeeSats
  }
}

export function partiesOf(open: ClosingOpen): PartyRow[] {
  const rows: PartyRow[] = [
    { role: 'buyer', name: open.buyerName },
    { role: 'seller', name: open.originalPayeeName }
  ]
  if (open.agentIdentity) rows.push({ role: 'agent', name: open.agentName })
  return rows
}

export function attestationToken(sellerIdentity: string, docHash: string): string {
  return sha256Hex([
    'closing',
    'attest',
    sellerIdentity.trim().toLowerCase(),
    docHash.trim().toLowerCase()
  ].join('\n'))
}

export function attestationMatches(attest: Pick<ClosingAttest, 'sellerIdentity' | 'docHash' | 'attestation'>): boolean {
  return attest.attestation === attestationToken(attest.sellerIdentity, attest.docHash)
}

export function emptyDesk(): DeskState {
  return {
    open: null,
    deed: null,
    attestation: null,
    proposal: null,
    payeeApprovals: [],
    releaseApprovals: [],
    released: null,
    hashStatus: 'none',
    rejection: null,
    notice: null,
    amendmentApplied: false,
    sawSwapRejection: false
  }
}

export function activeAmendment(state: Pick<DeskState, 'open' | 'amendmentApplied'>): number {
  if (!state.open || !state.amendmentApplied) return 0
  return state.open.amendmentFeeSats
}

export function deskFeeLines(state: DeskState): FeeLines | null {
  if (!state.open) return null
  if (state.released) {
    return {
      amountSats: state.released.amountSats,
      feeBps: state.released.feeBps,
      feeSats: state.released.feeSats,
      amendmentFeeSats: state.released.amendmentFeeSats,
      netSats: state.released.netSats
    }
  }
  return feeLines({
    amountSats: state.open.amountSats,
    feeBps: state.open.feeBps,
    amendmentFeeSats: activeAmendment(state)
  })
}

export function payeeChanged(open: ClosingOpen): boolean {
  return !sameIdentity(open.payeeIdentity, open.originalPayeeIdentity)
    || open.payeeName.trim() !== open.originalPayeeName.trim()
}

function assertLabel(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) throw new Error('Name what you are closing.')
  if (trimmed.length > LABEL_MAX) throw new Error(`Keep the name to ${LABEL_MAX} characters.`)
  return trimmed
}

function assertName(name: string, fallback: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error(fallback)
  if (trimmed.length > NAME_MAX) throw new Error(`Keep the name to ${NAME_MAX} characters.`)
  return trimmed
}

export function assertAmountSats(amountSats: number): void {
  if (!Number.isInteger(amountSats) || amountSats < MIN_AMOUNT_SATS || amountSats > MAX_AMOUNT_SATS) {
    throw new Error('Enter a whole closing amount.')
  }
}

export function assertFeeBps(feeBps: number): void {
  if (!Number.isInteger(feeBps) || feeBps < MIN_FEE_BPS || feeBps > MAX_FEE_BPS) {
    throw new Error(`Fee must be a whole number of basis points from ${MIN_FEE_BPS} to ${MAX_FEE_BPS}. 100 is 1%.`)
  }
}

export function assertAmendment(amendmentFeeSats: number): void {
  if (!Number.isInteger(amendmentFeeSats) || amendmentFeeSats < 0) {
    throw new Error('Amendment fee must be a whole number, or blank.')
  }
}

function resolveIdentity(name: string, supplied?: string): string {
  const trimmed = supplied?.trim() ?? ''
  if (!trimmed) return identityFor(name)
  if (!isIdentityKey(trimmed)) throw new Error('A party key must be a compressed public key.')
  return trimmed.toLowerCase()
}

function assertNet(lines: FeeLines): void {
  if (!Number.isInteger(lines.netSats) || lines.netSats < 1) {
    throw new Error('The fee leaves nothing for the payee.')
  }
}

export function openClosing(input: OpenInput, now = nowIso(), closingId = newClosingId()): DeskState {
  const label = assertLabel(input.label)
  assertAmountSats(input.amountSats)
  assertFeeBps(input.feeBps)
  assertAmendment(input.amendmentFeeSats)
  const sellerName = assertName(input.sellerName, 'Name the seller.')
  const buyerName = assertName(input.buyerName ?? 'Buyer', 'Name the buyer.')
  const sellerIdentity = resolveIdentity(sellerName, input.sellerIdentity)
  const buyerIdentity = resolveIdentity(buyerName, input.buyerIdentity)
  let agentName = ''
  let agentIdentity = ''
  if (input.includeAgent) {
    agentName = assertName(input.agentName ?? '', 'Name the closing agent, or leave them off.')
    agentIdentity = resolveIdentity(agentName, input.agentIdentity)
  }
  const identities = [buyerIdentity, sellerIdentity, agentIdentity].filter(Boolean)
  if (new Set(identities).size !== identities.length) {
    throw new Error('Each party needs their own name.')
  }
  const threshold = quorumSize(identities.length)
  const lines = feeLines({
    amountSats: input.amountSats,
    feeBps: input.feeBps,
    amendmentFeeSats: input.amendmentFeeSats
  })
  assertNet(lines)
  if (!isClosingId(closingId)) throw new Error('Closing id is missing.')
  const open: ClosingOpen = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'open',
    closingId,
    label,
    amountSats: input.amountSats,
    feeBps: input.feeBps,
    amendmentFeeSats: input.amendmentFeeSats,
    payeeIdentity: sellerIdentity,
    payeeName: sellerName,
    originalPayeeIdentity: sellerIdentity,
    originalPayeeName: sellerName,
    buyerIdentity,
    buyerName,
    agentIdentity,
    agentName,
    threshold,
    createdAt: now
  }
  const invalid = validateOpen(open)
  if (invalid) throw new Error(invalid)
  return { ...emptyDesk(), open, notice: PAYEE_BOUND }
}

function requireOpen(state: DeskState): ClosingOpen {
  if (!state.open) throw new Error('Open a closing first.')
  if (state.released) throw new Error('This closing is already released.')
  return state.open
}

export function attachDeed(
  state: DeskState,
  docHash: string,
  docLabel: string,
  now = nowIso()
): DeskState {
  const open = requireOpen(state)
  const hash = docHash.trim().toLowerCase()
  if (!isDocHash(hash)) throw new Error('The deed hash is not ready.')
  const label = docLabel.trim() || 'Deed'
  if (label.length > DOC_LABEL_MAX) throw new Error(`Keep the deed name to ${DOC_LABEL_MAX} characters.`)
  const deed: ClosingDeed = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'deed',
    closingId: open.closingId,
    docHash: hash,
    docLabel: label,
    attachedAt: now
  }
  const invalid = validateDeed(deed)
  if (invalid) throw new Error(invalid)
  return {
    ...state,
    deed,
    attestation: null,
    hashStatus: 'match',
    rejection: null,
    notice: HASH_MATCH
  }
}

export function checkHash(state: DeskState, docHash: string): DeskState {
  if (!state.deed || !state.open) {
    return { ...state, hashStatus: 'none', rejection: NEED_DEED, notice: null }
  }
  const hash = docHash.trim().toLowerCase()
  const match = isDocHash(hash) && hash === state.deed.docHash
  return {
    ...state,
    hashStatus: match ? 'match' : 'mismatch',
    rejection: match ? null : HASH_MISMATCH,
    notice: match ? HASH_MATCH : null
  }
}

export function attestDeed(state: DeskState, now = nowIso()): DeskState {
  const open = requireOpen(state)
  if (!state.deed) return { ...state, rejection: NEED_DEED, notice: null }
  if (state.hashStatus !== 'match') return { ...state, rejection: NEED_HASH_MATCH, notice: null }
  const attestation = attestationToken(open.originalPayeeIdentity, state.deed.docHash)
  const record: ClosingAttest = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'attest',
    closingId: open.closingId,
    docHash: state.deed.docHash,
    sellerIdentity: open.originalPayeeIdentity,
    attestation,
    attestedAt: now
  }
  const invalid = validateAttest(record)
  if (invalid) throw new Error(invalid)
  return { ...state, attestation: record, rejection: null, notice: ATTESTED }
}

export function attemptPayeeSwap(state: DeskState, proposedName: string, now = nowIso()): DeskState {
  const open = requireOpen(state)
  const name = assertName(proposedName, NEED_NAME)
  const identity = identityFor(name)
  if (sameIdentity(identity, open.payeeIdentity) || name === open.payeeName) {
    return { ...state, rejection: ALREADY_PAYEE, notice: null }
  }
  const proposal = { name, identity }
  const proposalChanged = !state.proposal
    || state.proposal.name !== name
    || !sameIdentity(state.proposal.identity, identity)
  const payeeApprovals = proposalChanged ? [] : state.payeeApprovals
  const next: DeskState = { ...state, proposal, payeeApprovals, rejection: null }
  if (next.payeeApprovals.length >= open.threshold) return applyPayee(next, now)
  return {
    ...next,
    rejection: SWAP_REJECTED,
    notice: null,
    sawSwapRejection: true
  }
}

export function approvePayeeChange(state: DeskState, role: PartyRole, now = nowIso()): DeskState {
  const open = requireOpen(state)
  if (!isRole(role) || !partiesOf(open).some((party) => party.role === role)) {
    return { ...state, rejection: 'That person is not a party.', notice: null }
  }
  if (!state.proposal) return { ...state, rejection: NEED_NAME, notice: null }
  if (state.payeeApprovals.includes(role)) return state
  const payeeApprovals = [...state.payeeApprovals, role]
  const next = { ...state, payeeApprovals, rejection: null }
  if (payeeApprovals.length >= open.threshold) return applyPayee(next, now)
  return next
}

function applyPayee(state: DeskState, now: string): DeskState {
  if (!state.open || !state.proposal) return state
  const open: ClosingOpen = {
    ...state.open,
    payeeIdentity: state.proposal.identity,
    payeeName: state.proposal.name
  }
  const invalid = validateOpen(open)
  if (invalid) throw new Error(invalid)
  void now
  return {
    ...state,
    open,
    proposal: null,
    payeeApprovals: [],
    releaseApprovals: [],
    amendmentApplied: state.amendmentApplied || state.open.amendmentFeeSats > 0,
    rejection: null,
    notice: PAYEE_CHANGED
  }
}

export function approveRelease(state: DeskState, role: PartyRole): DeskState {
  const open = requireOpen(state)
  if (!isRole(role) || !partiesOf(open).some((party) => party.role === role)) {
    return { ...state, rejection: 'That person is not a party.', notice: null }
  }
  if (state.releaseApprovals.includes(role)) return state
  return { ...state, releaseApprovals: [...state.releaseApprovals, role], rejection: null }
}

export function releaseReady(state: DeskState): string | null {
  if (!state.open) return 'Open a closing first.'
  if (state.released) return 'This closing is already released.'
  if (!state.deed || state.hashStatus !== 'match') return state.deed ? NEED_HASH_MATCH : NEED_DEED
  if (!state.attestation || state.attestation.docHash !== state.deed.docHash || !attestationMatches(state.attestation)) {
    return NEED_ATTEST
  }
  if (state.releaseApprovals.length < state.open.threshold) return NEED_APPROVALS
  return null
}

export function releaseClosing(state: DeskState, now = nowIso()): DeskState {
  const blocked = releaseReady(state)
  if (blocked || !state.open || !state.deed || !state.attestation) {
    return { ...state, rejection: blocked ?? NEED_APPROVALS, notice: null }
  }
  const lines = feeLines({
    amountSats: state.open.amountSats,
    feeBps: state.open.feeBps,
    amendmentFeeSats: activeAmendment(state)
  })
  try {
    assertNet(lines)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The fee leaves nothing for the payee.'
    return { ...state, rejection: message, notice: null }
  }
  const released: ClosingRelease = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'release',
    closingId: state.open.closingId,
    payeeIdentity: state.open.payeeIdentity,
    payeeName: state.open.payeeName,
    amountSats: lines.amountSats,
    feeBps: lines.feeBps,
    feeSats: lines.feeSats,
    amendmentFeeSats: lines.amendmentFeeSats,
    netSats: lines.netSats,
    docHash: state.deed.docHash,
    attestation: state.attestation.attestation,
    swapRejected: state.sawSwapRejection ? '1' : '0',
    releasedAt: now
  }
  const invalid = validateRelease(released)
  if (invalid) throw new Error(invalid)
  return { ...state, released, rejection: null, notice: RELEASED_NOTE }
}

export function validateOpen(open: ClosingOpen): string | null {
  if (open.magic !== MAGIC || open.kind !== 'open') return 'Not a closing.'
  if (open.version !== SCHEMA_VERSION) return 'Not this closing version.'
  if (!isClosingId(open.closingId)) return 'Closing id is missing.'
  if (!open.label.trim() || open.label.length > LABEL_MAX) return 'The closing name is missing.'
  try {
    assertAmountSats(open.amountSats)
    assertFeeBps(open.feeBps)
    assertAmendment(open.amendmentFeeSats)
  } catch (error) {
    return error instanceof Error ? error.message : 'Amount is invalid.'
  }
  if (!isIdentityKey(open.payeeIdentity) || !isIdentityKey(open.originalPayeeIdentity)) return 'Payee is missing.'
  if (!isIdentityKey(open.buyerIdentity)) return 'Buyer is missing.'
  if (!open.payeeName.trim() || !open.originalPayeeName.trim() || !open.buyerName.trim()) return 'A party name is missing.'
  if (open.agentIdentity && !isIdentityKey(open.agentIdentity)) return 'Closing agent is missing.'
  if (!open.agentIdentity && open.agentName.trim()) return 'Closing agent is missing.'
  if (open.agentIdentity && !open.agentName.trim()) return 'Closing agent is missing.'
  const count = open.agentIdentity ? 3 : 2
  if (open.threshold !== quorumSize(count)) return 'Approval count is wrong.'
  if (!isIsoDateTime(open.createdAt)) return 'Opened time is missing.'
  return null
}

export function validateDeed(deed: ClosingDeed): string | null {
  if (deed.magic !== MAGIC || deed.kind !== 'deed') return 'Not a deed.'
  if (!isClosingId(deed.closingId)) return 'Closing id is missing.'
  if (!isDocHash(deed.docHash)) return 'Deed hash is missing.'
  if (!deed.docLabel.trim()) return 'Deed name is missing.'
  if (!isIsoDateTime(deed.attachedAt)) return 'Attached time is missing.'
  return null
}

export function validateAttest(attest: ClosingAttest): string | null {
  if (attest.magic !== MAGIC || attest.kind !== 'attest') return 'Not an attestation.'
  if (!isClosingId(attest.closingId)) return 'Closing id is missing.'
  if (!isDocHash(attest.docHash)) return 'Deed hash is missing.'
  if (!isIdentityKey(attest.sellerIdentity)) return 'Seller is missing.'
  if (!isDocHash(attest.attestation)) return 'Attestation is missing.'
  if (!attestationMatches(attest)) return ATTEST_MISMATCH
  if (!isIsoDateTime(attest.attestedAt)) return 'Attested time is missing.'
  return null
}

export function validateRelease(release: ClosingRelease): string | null {
  if (release.magic !== MAGIC || release.kind !== 'release') return 'Not a release.'
  if (!isClosingId(release.closingId)) return 'Closing id is missing.'
  if (!isIdentityKey(release.payeeIdentity) || !release.payeeName.trim()) return 'Payee is missing.'
  try {
    assertAmountSats(release.amountSats)
    assertFeeBps(release.feeBps)
    assertAmendment(release.amendmentFeeSats)
  } catch (error) {
    return error instanceof Error ? error.message : 'Amount is invalid.'
  }
  const lines = feeLines(release)
  if (release.feeSats !== lines.feeSats || release.netSats !== lines.netSats) return 'Fee lines do not add up.'
  if (release.netSats < 1) return 'The fee leaves nothing for the payee.'
  if (!isDocHash(release.docHash) || !isDocHash(release.attestation)) return 'Deed record is missing.'
  if (release.swapRejected !== '0' && release.swapRejected !== '1') return 'Swap flag is missing.'
  if (!isIsoDateTime(release.releasedAt)) return 'Released time is missing.'
  return null
}

function encodeHead(kind: ClosingKind, closingId: string): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes(kind),
    stringToUtf8Bytes(closingId)
  ]
}

export function encodeOpenFields(open: ClosingOpen): number[][] {
  const invalid = validateOpen(open)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('open', open.closingId),
    stringToUtf8Bytes(open.label),
    stringToUtf8Bytes(String(open.amountSats)),
    stringToUtf8Bytes(String(open.feeBps)),
    stringToUtf8Bytes(String(open.amendmentFeeSats)),
    stringToUtf8Bytes(open.payeeIdentity),
    stringToUtf8Bytes(open.payeeName),
    stringToUtf8Bytes(open.originalPayeeIdentity),
    stringToUtf8Bytes(open.originalPayeeName),
    stringToUtf8Bytes(open.buyerIdentity),
    stringToUtf8Bytes(open.buyerName),
    stringToUtf8Bytes(open.agentIdentity),
    stringToUtf8Bytes(open.agentName),
    stringToUtf8Bytes(String(open.threshold)),
    stringToUtf8Bytes(open.createdAt)
  ]
}

export function encodeDeedFields(deed: ClosingDeed): number[][] {
  const invalid = validateDeed(deed)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('deed', deed.closingId),
    stringToUtf8Bytes(deed.docHash),
    stringToUtf8Bytes(deed.docLabel),
    stringToUtf8Bytes(deed.attachedAt)
  ]
}

export function encodeAttestFields(attest: ClosingAttest): number[][] {
  const invalid = validateAttest(attest)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('attest', attest.closingId),
    stringToUtf8Bytes(attest.docHash),
    stringToUtf8Bytes(attest.sellerIdentity),
    stringToUtf8Bytes(attest.attestation),
    stringToUtf8Bytes(attest.attestedAt)
  ]
}

export function encodeReleaseFields(release: ClosingRelease): number[][] {
  const invalid = validateRelease(release)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('release', release.closingId),
    stringToUtf8Bytes(release.payeeIdentity),
    stringToUtf8Bytes(release.payeeName),
    stringToUtf8Bytes(String(release.amountSats)),
    stringToUtf8Bytes(String(release.feeBps)),
    stringToUtf8Bytes(String(release.feeSats)),
    stringToUtf8Bytes(String(release.amendmentFeeSats)),
    stringToUtf8Bytes(String(release.netSats)),
    stringToUtf8Bytes(release.docHash),
    stringToUtf8Bytes(release.attestation),
    stringToUtf8Bytes(release.swapRejected),
    stringToUtf8Bytes(release.releasedAt)
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

export function parseClosingFields(fields: Array<number[] | Uint8Array>): ClosingPayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3 || rest[0] !== SCHEMA_VERSION) return null
  const kind = rest[1]
  const closingId = rest[2]
  if (kind === 'open') {
    if (rest.length < 17) return null
    const amountSats = whole(rest[4])
    const feeBps = whole(rest[5])
    const amendmentFeeSats = whole(rest[6])
    const threshold = whole(rest[15])
    if (amountSats == null || feeBps == null || amendmentFeeSats == null || threshold == null) return null
    const open: ClosingOpen = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'open',
      closingId,
      label: rest[3],
      amountSats,
      feeBps,
      amendmentFeeSats,
      payeeIdentity: rest[7],
      payeeName: rest[8],
      originalPayeeIdentity: rest[9],
      originalPayeeName: rest[10],
      buyerIdentity: rest[11],
      buyerName: rest[12],
      agentIdentity: rest[13],
      agentName: rest[14],
      threshold,
      createdAt: rest[16]
    }
    return validateOpen(open) ? null : open
  }
  if (kind === 'deed') {
    if (rest.length < 6) return null
    const deed: ClosingDeed = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'deed',
      closingId,
      docHash: rest[3],
      docLabel: rest[4],
      attachedAt: rest[5]
    }
    return validateDeed(deed) ? null : deed
  }
  if (kind === 'attest') {
    if (rest.length < 7) return null
    const attest: ClosingAttest = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'attest',
      closingId,
      docHash: rest[3],
      sellerIdentity: rest[4],
      attestation: rest[5],
      attestedAt: rest[6]
    }
    return validateAttest(attest) ? null : attest
  }
  if (kind === 'release') {
    if (rest.length < 14) return null
    const amountSats = whole(rest[5])
    const feeBps = whole(rest[6])
    const fee = whole(rest[7])
    const amendmentFeeSats = whole(rest[8])
    const netSats = whole(rest[9])
    if (amountSats == null || feeBps == null || fee == null || amendmentFeeSats == null || netSats == null) return null
    const swapRejected = rest[12]
    if (swapRejected !== '0' && swapRejected !== '1') return null
    const release: ClosingRelease = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'release',
      closingId,
      payeeIdentity: rest[3],
      payeeName: rest[4],
      amountSats,
      feeBps,
      feeSats: fee,
      amendmentFeeSats,
      netSats,
      docHash: rest[10],
      attestation: rest[11],
      swapRejected,
      releasedAt: rest[13]
    }
    return validateRelease(release) ? null : release
  }
  return null
}

export function deskFromRecords(records: ClosingPayload[], closingId?: string): DeskState | null {
  const scoped = closingId ? records.filter((row) => row.closingId === closingId) : records
  const open = scoped.find((row): row is ClosingOpen => row.kind === 'open') ?? null
  if (!open) return null
  const deed = scoped.find((row): row is ClosingDeed => row.kind === 'deed' && row.closingId === open.closingId) ?? null
  const attestation = scoped.find((row): row is ClosingAttest => row.kind === 'attest' && row.closingId === open.closingId) ?? null
  const releasedCandidate = scoped.find((row): row is ClosingRelease => row.kind === 'release' && row.closingId === open.closingId) ?? null
  const released = releasedCandidate
    && sameIdentity(releasedCandidate.payeeIdentity, open.payeeIdentity)
    && releasedCandidate.payeeName.trim() === open.payeeName.trim()
    ? releasedCandidate
    : null
  return {
    ...emptyDesk(),
    open,
    deed,
    attestation,
    released,
    hashStatus: deed ? 'match' : 'none',
    amendmentApplied: Boolean(released && released.amendmentFeeSats > 0) || payeeChanged(open),
    sawSwapRejection: released?.swapRejected === '1',
    notice: released ? RELEASED_NOTE : PAYEE_BOUND
  }
}
