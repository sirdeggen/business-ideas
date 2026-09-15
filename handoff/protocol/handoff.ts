/**
 * Handoff Desk protocol (PushDrop / BRC-48 fields).
 *
 * Seller lists a digital asset. Buyer funds escrow. Both confirm
 * the handoff. Release pays the seller minus a small ~1% protocol
 * fee and emits a receipt. MAGIC `handoff`. Public Pages uses
 * tm_anytx / ls_anytx. Client filters on MAGIC.
 *
 * L.A.U.R.A. Ownership Market / Escrow.com digital APA analog.
 * Digital ownership transfer only — not a vaulted physical, not
 * a job hash lock.
 */

export const PROTOCOL_ID: [0, string] = [0, 'handoff']
export const BASKET = 'handoff'
export const MAGIC = 'handoff'
export const SCHEMA_VERSION = '1'
export const BRC29_PROTOCOL_ID: [2, string] = [2, '3241645161d8']
export const MESSAGE_BOX = 'handoff'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'

export const TITLE_MAX = 80
export const DESCRIPTION_MAX = 400
export const MIN_PRICE_SATS = 1
export const MAX_PRICE_SATS = 1_000_000_000_000
export const LIST_SATS = 1
export const CONFIRM_SATS = 1
export const DEFAULT_TITLE = 'Repo access'
export const DEFAULT_ASSET_TYPE = 'repo'
export const DEFAULT_DESCRIPTION = 'Intent to transfer repo access.'
export const DEFAULT_PRICE_SATS = 100_000
/** Product-story fee. Release deducts this from the seller payout. */
export const PROTOCOL_FEE_BPS = 100

export const ASSET_TYPES = ['repo', 'app', 'domain'] as const
export type AssetType = (typeof ASSET_TYPES)[number]

export const KINDS = ['list', 'fund', 'confirm', 'release'] as const
export type HandoffKind = (typeof KINDS)[number]

export const PARTIES = ['seller', 'buyer'] as const
export type HandoffParty = (typeof PARTIES)[number]

export type HandoffStatus =
  | 'listed'
  | 'funded'
  | 'seller_confirmed'
  | 'buyer_confirmed'
  | 'confirmed'
  | 'released'

export type SheetTitle = 'Handoff Desk' | 'Confirm' | 'Release' | 'Released'

export interface HandoffList {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'list'
  listingId: string
  title: string
  assetType: AssetType
  description: string
  priceSats: number
  sellerIdentity: string
  createdAt: string
}

export interface HandoffFund {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'fund'
  listingId: string
  buyerIdentity: string
  amountSats: number
  fundedAt: string
}

export interface HandoffConfirm {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'confirm'
  listingId: string
  party: HandoffParty
  identity: string
  confirmedAt: string
}

export interface HandoffRelease {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'release'
  listingId: string
  sellerIdentity: string
  buyerIdentity: string
  sellerSats: number
  feeSats: number
  releasedAt: string
}

export type HandoffPayload = HandoffList | HandoffFund | HandoffConfirm | HandoffRelease

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const LISTING_ID = /^[0-9a-f]{32}$/
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

export function isListingId(value: string): boolean {
  return LISTING_ID.test(value.trim().toLowerCase())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  const date = new Date(trimmed)
  return !Number.isNaN(date.getTime())
}

export function isAssetType(value: string): value is AssetType {
  return (ASSET_TYPES as readonly string[]).includes(value)
}

export function isParty(value: string): value is HandoffParty {
  return (PARTIES as readonly string[]).includes(value)
}

export function newListingId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function assertPriceSats(priceSats: number): void {
  if (!Number.isInteger(priceSats) || priceSats < MIN_PRICE_SATS || priceSats > MAX_PRICE_SATS) {
    throw new Error(`Price must be a whole number between ${MIN_PRICE_SATS} and ${MAX_PRICE_SATS}.`)
  }
}

export function assertTitle(title: string): void {
  const trimmed = title.trim()
  if (!trimmed) throw new Error('Title is required.')
  if (trimmed.length > TITLE_MAX) {
    throw new Error(`Title must be at most ${TITLE_MAX} characters.`)
  }
}

export function assertDescription(description: string): void {
  const trimmed = description.trim()
  if (!trimmed) throw new Error('Description is required.')
  if (trimmed.length > DESCRIPTION_MAX) {
    throw new Error(`Description must be at most ${DESCRIPTION_MAX} characters.`)
  }
}

export function assertAssetType(value: string): AssetType {
  const trimmed = value.trim().toLowerCase()
  if (!isAssetType(trimmed)) throw new Error('Asset type must be repo, app, or domain.')
  return trimmed
}

export function protocolFeeSats(priceSats: number): number {
  assertPriceSats(priceSats)
  return Math.floor((priceSats * PROTOCOL_FEE_BPS) / 10_000)
}

export function sellerPayoutSats(priceSats: number): number {
  const fee = protocolFeeSats(priceSats)
  const payout = priceSats - fee
  return payout < 1 ? priceSats : payout
}

export function listingStatus(parts: {
  list?: unknown
  fund?: unknown
  sellerConfirm?: unknown
  buyerConfirm?: unknown
  release?: unknown
}): HandoffStatus | null {
  if (!parts.list) return null
  if (parts.release) return 'released'
  if (parts.sellerConfirm && parts.buyerConfirm) return 'confirmed'
  if (parts.sellerConfirm) return 'seller_confirmed'
  if (parts.buyerConfirm) return 'buyer_confirmed'
  if (parts.fund) return 'funded'
  return 'listed'
}

export function sheetTitle(status: HandoffStatus | null): SheetTitle {
  switch (status) {
    case 'funded':
    case 'seller_confirmed':
    case 'buyer_confirmed':
      return 'Confirm'
    case 'confirmed':
      return 'Release'
    case 'released':
      return 'Released'
    default:
      return 'Handoff Desk'
  }
}

export function canFund(status: HandoffStatus | null): boolean {
  return status === 'listed'
}

export function canConfirm(status: HandoffStatus | null): boolean {
  return status === 'funded' || status === 'seller_confirmed' || status === 'buyer_confirmed'
}

export function canRelease(status: HandoffStatus | null): boolean {
  return status === 'confirmed'
}

export function sameIdentity(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function isSeller(list: Pick<HandoffList, 'sellerIdentity'>, identityKey: string): boolean {
  return sameIdentity(list.sellerIdentity, identityKey)
}

export function isBuyer(fund: Pick<HandoffFund, 'buyerIdentity'>, identityKey: string): boolean {
  return sameIdentity(fund.buyerIdentity, identityKey)
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

export function validateList(list: HandoffList): string | null {
  if (list.magic !== MAGIC) return 'Not a handoff.'
  if (list.kind !== 'list') return 'Not a listing.'
  if (!isListingId(list.listingId)) return 'Listing id is missing.'
  try {
    assertTitle(list.title)
  } catch (error) {
    return error instanceof Error ? error.message : 'Title is invalid.'
  }
  if (!isAssetType(list.assetType)) return 'Asset type must be repo, app, or domain.'
  try {
    assertDescription(list.description)
  } catch (error) {
    return error instanceof Error ? error.message : 'Description is invalid.'
  }
  try {
    assertPriceSats(list.priceSats)
  } catch (error) {
    return error instanceof Error ? error.message : 'Price is invalid.'
  }
  if (!isIdentityKey(list.sellerIdentity)) return 'Seller identity is missing.'
  if (!isIsoDateTime(list.createdAt)) return 'Created time is missing.'
  return null
}

export function validateFund(fund: HandoffFund): string | null {
  if (fund.magic !== MAGIC) return 'Not a handoff.'
  if (fund.kind !== 'fund') return 'Not a fund record.'
  if (!isListingId(fund.listingId)) return 'Listing id is missing.'
  if (!isIdentityKey(fund.buyerIdentity)) return 'Buyer identity is missing.'
  try {
    assertPriceSats(fund.amountSats)
  } catch (error) {
    return error instanceof Error ? error.message : 'Amount is invalid.'
  }
  if (!isIsoDateTime(fund.fundedAt)) return 'Funded time is missing.'
  return null
}

export function validateConfirm(confirm: HandoffConfirm): string | null {
  if (confirm.magic !== MAGIC) return 'Not a handoff.'
  if (confirm.kind !== 'confirm') return 'Not a confirm record.'
  if (!isListingId(confirm.listingId)) return 'Listing id is missing.'
  if (!isParty(confirm.party)) return 'Party must be seller or buyer.'
  if (!isIdentityKey(confirm.identity)) return 'Confirm identity is missing.'
  if (!isIsoDateTime(confirm.confirmedAt)) return 'Confirmed time is missing.'
  return null
}

export function validateRelease(release: HandoffRelease): string | null {
  if (release.magic !== MAGIC) return 'Not a handoff.'
  if (release.kind !== 'release') return 'Not a release record.'
  if (!isListingId(release.listingId)) return 'Listing id is missing.'
  if (!isIdentityKey(release.sellerIdentity)) return 'Seller identity is missing.'
  if (!isIdentityKey(release.buyerIdentity)) return 'Buyer identity is missing.'
  if (!Number.isInteger(release.sellerSats) || release.sellerSats < 1) return 'Seller payout is missing.'
  if (!Number.isInteger(release.feeSats) || release.feeSats < 0) return 'Fee is missing.'
  if (!isIsoDateTime(release.releasedAt)) return 'Released time is missing.'
  return null
}

export function encodeListFields(list: Omit<HandoffList, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: HandoffList = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'list', ...list }
  const invalid = validateList(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('list'),
    stringToUtf8Bytes(list.listingId),
    stringToUtf8Bytes(list.title.trim()),
    stringToUtf8Bytes(list.assetType),
    stringToUtf8Bytes(list.description.trim()),
    stringToUtf8Bytes(String(list.priceSats)),
    stringToUtf8Bytes(list.sellerIdentity),
    stringToUtf8Bytes(list.createdAt)
  ]
}

export function encodeFundFields(fund: Omit<HandoffFund, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: HandoffFund = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'fund', ...fund }
  const invalid = validateFund(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('fund'),
    stringToUtf8Bytes(fund.listingId),
    stringToUtf8Bytes(fund.buyerIdentity),
    stringToUtf8Bytes(String(fund.amountSats)),
    stringToUtf8Bytes(fund.fundedAt)
  ]
}

export function encodeConfirmFields(confirm: Omit<HandoffConfirm, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: HandoffConfirm = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'confirm', ...confirm }
  const invalid = validateConfirm(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('confirm'),
    stringToUtf8Bytes(confirm.listingId),
    stringToUtf8Bytes(confirm.party),
    stringToUtf8Bytes(confirm.identity),
    stringToUtf8Bytes(confirm.confirmedAt)
  ]
}

export function encodeReleaseFields(release: Omit<HandoffRelease, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: HandoffRelease = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'release', ...release }
  const invalid = validateRelease(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('release'),
    stringToUtf8Bytes(release.listingId),
    stringToUtf8Bytes(release.sellerIdentity),
    stringToUtf8Bytes(release.buyerIdentity),
    stringToUtf8Bytes(String(release.sellerSats)),
    stringToUtf8Bytes(String(release.feeSats)),
    stringToUtf8Bytes(release.releasedAt)
  ]
}

function listFromParts(parts: Omit<HandoffList, 'magic' | 'version' | 'kind'>): HandoffList | null {
  const list: HandoffList = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'list', ...parts }
  return validateList(list) ? null : list
}

function fundFromParts(parts: Omit<HandoffFund, 'magic' | 'version' | 'kind'>): HandoffFund | null {
  const fund: HandoffFund = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'fund', ...parts }
  return validateFund(fund) ? null : fund
}

function confirmFromParts(parts: Omit<HandoffConfirm, 'magic' | 'version' | 'kind'>): HandoffConfirm | null {
  const confirm: HandoffConfirm = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'confirm', ...parts }
  return validateConfirm(confirm) ? null : confirm
}

function releaseFromParts(parts: Omit<HandoffRelease, 'magic' | 'version' | 'kind'>): HandoffRelease | null {
  const release: HandoffRelease = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'release', ...parts }
  return validateRelease(release) ? null : release
}

export function parseHandoffFields(fields: Array<number[] | Uint8Array>): HandoffPayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3) return null
  const version = rest[0]
  const kind = rest[1]
  if (version !== SCHEMA_VERSION) return null
  if (kind === 'list') {
    if (rest.length < 9) return null
    const priceSats = Number(rest[6])
    if (!Number.isInteger(priceSats)) return null
    if (!isAssetType(rest[4])) return null
    return listFromParts({
      listingId: rest[2],
      title: rest[3],
      assetType: rest[4],
      description: rest[5],
      priceSats,
      sellerIdentity: rest[7],
      createdAt: rest[8]
    })
  }
  if (kind === 'fund') {
    if (rest.length < 6) return null
    const amountSats = Number(rest[4])
    if (!Number.isInteger(amountSats)) return null
    return fundFromParts({
      listingId: rest[2],
      buyerIdentity: rest[3],
      amountSats,
      fundedAt: rest[5]
    })
  }
  if (kind === 'confirm') {
    if (rest.length < 6) return null
    if (!isParty(rest[3])) return null
    return confirmFromParts({
      listingId: rest[2],
      party: rest[3],
      identity: rest[4],
      confirmedAt: rest[5]
    })
  }
  if (kind === 'release') {
    if (rest.length < 8) return null
    const sellerSats = Number(rest[5])
    const feeSats = Number(rest[6])
    if (!Number.isInteger(sellerSats) || !Number.isInteger(feeSats)) return null
    return releaseFromParts({
      listingId: rest[2],
      sellerIdentity: rest[3],
      buyerIdentity: rest[4],
      sellerSats,
      feeSats,
      releasedAt: rest[7]
    })
  }
  return null
}

export function typeFace(type: AssetType): string {
  if (type === 'repo') return 'Repo'
  if (type === 'app') return 'App'
  return 'Domain'
}
