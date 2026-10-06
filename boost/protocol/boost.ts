import { BigNumber, ECDSA, Hash, PublicKey, Signature } from '@bsv/sdk'
import { sha256Hex } from './sha256'

/**
 * Boost desk protocol (PushDrop / BRC-48 fields).
 *
 * A local business, event, or vendor pays once for a verified profile,
 * then buys a time-boxed boost pack. Every boost is an overlay receipt.
 * Ranking is derived from those windows. MAGIC `boost`.
 *
 * Not Names (a name lease). Not KYA or Vouch (trust or identity).
 * Not Feed (a signed reading you pay to read).
 */

export const PROTOCOL_ID: [0, string] = [0, 'boost']
/** BRC-42 key id for createSignature / getPublicKey. counterparty is `self`. */
export const SIGNING_KEY_ID = 'boost'
export const BASKET = 'boost'
export const MAGIC = 'boost'
export const SCHEMA_VERSION = '1'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MESSAGE_BOX = 'boost'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'

export const NAME_MAX = 80
export const BLURB_MAX = 160
export const LINK_MAX = 200
/** One-time verified profile. Paid to the desk key. */
export const PROFILE_FEE_SATS = 2_000
export const ATTEST_SATS = 1

export const CATEGORIES = ['business', 'event', 'vendor'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABEL: Record<Category, string> = {
  business: 'Business',
  event: 'Event',
  vendor: 'Vendor'
}

export const BOOST_PACKS = {
  '12h': { hours: 12, sats: 1_000 },
  '24h': { hours: 24, sats: 1_800 }
} as const

export type BoostPack = keyof typeof BOOST_PACKS
export const BOOST_PACK_IDS = ['12h', '24h'] as const

export const DEFAULT_NAME = 'Harbor market'
export const DEFAULT_CATEGORY: Category = 'business'
export const DEFAULT_BLURB = 'Saturday stalls, coffee, and local makers.'
export const DEFAULT_LINK = ''

export const KINDS = ['profile', 'boost'] as const
export type BoostRecordKind = (typeof KINDS)[number]

export interface ProfileRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'profile'
  profileId: string
  category: Category
  name: string
  blurb: string
  link: string
  owner: string
  desk: string
  profileFeeSats: number
  createdAt: string
  signature: string
}

export interface BoostRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'boost'
  profileId: string
  boostId: string
  owner: string
  pack: BoostPack
  hours: number
  paidSats: number
  startsAt: string
  endsAt: string
  signature: string
}

export type BoostPayload = ProfileRecord | BoostRecord

export interface BoostQuote {
  pack: BoostPack
  hours: number
  paidSats: number
}

export interface RankedProfile {
  profile: ProfileRecord
  activeBoost: BoostRecord | null
  boosted: boolean
}

export interface ReadingBoost {
  boostId: string
  pack: BoostPack
  hours: number
  paidSats: number
  startsAt: string
  endsAt: string
  active: boolean
}

export interface BoostReading {
  kind: 'boost-reading'
  profileId: string
  category: Category
  name: string
  blurb: string
  link: string
  owner: string
  desk: string
  profileFeeSats: number
  createdAt: string
  boosted: boolean
  activeUntil: string | null
  boosts: ReadingBoost[]
  exportedAt: string
}

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const PROFILE_ID = /^[0-9a-f]{32}$/
const BOOST_ID = /^[0-9a-f]{64}$/
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

export function isProfileId(value: string): boolean {
  return PROFILE_ID.test(value.trim().toLowerCase())
}

export function isBoostId(value: string): boolean {
  return BOOST_ID.test(value.trim().toLowerCase())
}

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value)
}

export function isBoostPack(value: string): value is BoostPack {
  return (BOOST_PACK_IDS as readonly string[]).includes(value)
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  return !Number.isNaN(new Date(trimmed).getTime())
}

export function categoryLabel(category: Category): string {
  return CATEGORY_LABEL[category]
}

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Same owner and the same listing name. A later profile does not get a second row. */
export function profileCollisionKey(owner: string, name: string): string {
  return `${owner.trim().toLowerCase()}|${normalizeName(name)}`
}

export function profileBindingId(record: {
  category: string
  name: string
  blurb: string
  link: string
  owner: string
  desk: string
  profileFeeSats: number
  createdAt: string
}): string {
  const body = JSON.stringify({
    v: 1,
    category: record.category,
    name: record.name.trim(),
    blurb: record.blurb.trim(),
    link: record.link.trim(),
    owner: record.owner.trim().toLowerCase(),
    desk: record.desk.trim().toLowerCase(),
    profileFeeSats: record.profileFeeSats,
    createdAt: record.createdAt
  })
  return sha256Hex(body).slice(0, 32)
}

export function quoteProfile(): { profileFeeSats: number } {
  return { profileFeeSats: PROFILE_FEE_SATS }
}

export function quoteBoost(pack: BoostPack): BoostQuote {
  const row = BOOST_PACKS[pack]
  return { pack, hours: row.hours, paidSats: row.sats }
}

export function bytesToHex(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(value: string): number[] | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!/^[0-9a-f]+$/.test(trimmed) || trimmed.length < 16 || trimmed.length % 2 !== 0) return null
  const out: number[] = []
  for (let index = 0; index < trimmed.length; index += 2) {
    out.push(Number.parseInt(trimmed.slice(index, index + 2), 16))
  }
  return out
}

/** BRC-100 createSignature({ data }) hashes once with SHA-256 before ECDSA. */
export function verifyWalletDataSignature(
  derivedPubkey: string,
  data: number[],
  derSignature: number[]
): boolean {
  try {
    const hash = Hash.sha256(data)
    const key = PublicKey.fromString(derivedPubkey)
    const signature = Signature.fromDER(derSignature)
    return ECDSA.verify(new BigNumber(hash), signature, key)
  } catch {
    return false
  }
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function endsAtFrom(startsAt: string, hours: number): string {
  const date = new Date(startsAt)
  date.setTime(date.getTime() + hours * 60 * 60 * 1000)
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function sameIdentity(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function assertName(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) throw new Error('Name the listing.')
  if (trimmed.length > NAME_MAX) throw new Error(`Name must be at most ${NAME_MAX} characters.`)
  if (/[\r\n]/.test(trimmed)) throw new Error('Name must be one line.')
  return trimmed
}

export function assertBlurb(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) throw new Error('Add a short blurb.')
  if (trimmed.length > BLURB_MAX) throw new Error(`Blurb must be at most ${BLURB_MAX} characters.`)
  if (/[\r\n]/.test(trimmed)) throw new Error('Blurb must be one line.')
  return trimmed
}

export function assertLink(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length > LINK_MAX) throw new Error('Link is too long.')
  if (/[\s]/.test(trimmed)) throw new Error('Link must be one web address.')
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('Link must start with https://.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Link must start with https://.')
  }
  return trimmed
}

export function canonicalProfileBytes(
  record: Pick<ProfileRecord, 'profileId' | 'category' | 'name' | 'blurb' | 'link' | 'owner' | 'desk' | 'profileFeeSats' | 'createdAt'>
): number[] {
  return stringToUtf8Bytes(JSON.stringify({
    v: 1,
    kind: 'profile',
    profileId: record.profileId.trim().toLowerCase(),
    category: record.category,
    name: record.name.trim(),
    blurb: record.blurb.trim(),
    link: record.link.trim(),
    owner: record.owner.trim().toLowerCase(),
    desk: record.desk.trim().toLowerCase(),
    profileFeeSats: record.profileFeeSats,
    createdAt: record.createdAt
  }))
}

export function canonicalBoostBytes(
  record: Pick<BoostRecord, 'profileId' | 'boostId' | 'owner' | 'pack' | 'hours' | 'paidSats' | 'startsAt' | 'endsAt'>
): number[] {
  return stringToUtf8Bytes(JSON.stringify({
    v: 1,
    kind: 'boost',
    profileId: record.profileId.trim().toLowerCase(),
    boostId: record.boostId.trim().toLowerCase(),
    owner: record.owner.trim().toLowerCase(),
    pack: record.pack,
    hours: record.hours,
    paidSats: record.paidSats,
    startsAt: record.startsAt,
    endsAt: record.endsAt
  }))
}

export function profileSignatureOk(record: ProfileRecord): boolean {
  const der = hexToBytes(record.signature)
  if (!der) return false
  return verifyWalletDataSignature(record.owner.trim(), canonicalProfileBytes(record), der)
}

export function boostSignatureOk(record: BoostRecord): boolean {
  const der = hexToBytes(record.signature)
  if (!der) return false
  return verifyWalletDataSignature(record.owner.trim(), canonicalBoostBytes(record), der)
}

export function makeBoostId(
  profileId: string,
  owner: string,
  pack: string,
  startsAt: string,
  nonce: string
): string {
  return sha256Hex(['boost', profileId, owner.trim().toLowerCase(), pack, startsAt, nonce].join('\n'))
}

export function formatSats(sats: number): string {
  const n = Math.trunc(sats)
  if (!Number.isFinite(n) || n < 0) return '0 sats'
  return n === 1 ? '1 sat' : `${n.toLocaleString('en-US')} sats`
}

export function isOwner(profile: Pick<ProfileRecord, 'owner'>, identityKey: string): boolean {
  return sameIdentity(profile.owner, identityKey)
}

export function validateProfile(record: ProfileRecord): string | null {
  if (record.magic !== MAGIC) return 'Not a boost record.'
  if (record.kind !== 'profile') return 'Not a profile record.'
  if (!isProfileId(record.profileId)) return 'Profile id is missing.'
  if (!isCategory(record.category)) return 'Pick a category.'
  let name = ''
  let blurb = ''
  let link = ''
  try {
    name = assertName(record.name)
    blurb = assertBlurb(record.blurb)
    link = assertLink(record.link)
  } catch (error) {
    return error instanceof Error ? error.message : 'Listing text is invalid.'
  }
  if (name !== record.name || blurb !== record.blurb || link !== record.link) {
    return 'Listing text is not in canonical form.'
  }
  if (!isIdentityKey(record.owner)) return 'Owner identity is missing.'
  if (!isIdentityKey(record.desk)) return 'Desk identity is missing.'
  if (record.profileFeeSats !== PROFILE_FEE_SATS) return 'Profile fee does not match.'
  if (!isIsoDateTime(record.createdAt)) return 'Created time is missing.'
  if (record.profileId.trim().toLowerCase() !== profileBindingId(record)) {
    return 'Profile id does not match this listing.'
  }
  if (!profileSignatureOk(record)) return 'This profile is not signed by the owner.'
  return null
}

export function validateBoost(record: BoostRecord): string | null {
  if (record.magic !== MAGIC) return 'Not a boost record.'
  if (record.kind !== 'boost') return 'Not a boost receipt.'
  if (!isProfileId(record.profileId)) return 'Profile id is missing.'
  if (!isBoostId(record.boostId)) return 'Boost id is missing.'
  if (!isIdentityKey(record.owner)) return 'Owner identity is missing.'
  if (!isBoostPack(record.pack)) return 'Pick a 12-hour or 24-hour boost.'
  const quote = quoteBoost(record.pack)
  if (record.hours !== quote.hours || record.paidSats !== quote.paidSats) {
    return 'Boost price does not match the pack.'
  }
  if (!isIsoDateTime(record.startsAt)) return 'Start time is missing.'
  if (!isIsoDateTime(record.endsAt)) return 'End time is missing.'
  if (record.endsAt !== endsAtFrom(record.startsAt, record.hours)) {
    return 'Boost window does not match the pack.'
  }
  if (!boostSignatureOk(record)) return 'This boost is not signed by the owner.'
  return null
}

function textFields(parts: string[]): number[][] {
  return parts.map((part) => stringToUtf8Bytes(part))
}

export function encodeProfileFields(
  record: Omit<ProfileRecord, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: ProfileRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'profile', ...record }
  const invalid = validateProfile(payload)
  if (invalid) throw new Error(invalid)
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'profile',
    record.profileId.toLowerCase(),
    record.category,
    record.name,
    record.blurb,
    record.link,
    record.owner,
    record.desk,
    String(record.profileFeeSats),
    record.createdAt,
    record.signature.trim().toLowerCase()
  ])
}

export function encodeBoostFields(
  record: Omit<BoostRecord, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: BoostRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'boost', ...record }
  const invalid = validateBoost(payload)
  if (invalid) throw new Error(invalid)
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'boost',
    record.profileId.toLowerCase(),
    record.boostId.toLowerCase(),
    record.owner,
    record.pack,
    String(record.hours),
    String(record.paidSats),
    record.startsAt,
    record.endsAt,
    record.signature.trim().toLowerCase()
  ])
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

function integerAt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed)) return null
  return parsed
}

function profileFromParts(parts: Omit<ProfileRecord, 'magic' | 'version' | 'kind'>): ProfileRecord | null {
  if (!isCategory(parts.category)) return null
  const record: ProfileRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'profile', ...parts }
  return validateProfile(record) ? null : record
}

function boostFromParts(parts: Omit<BoostRecord, 'magic' | 'version' | 'kind'>): BoostRecord | null {
  if (!isBoostPack(parts.pack)) return null
  const record: BoostRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'boost', ...parts }
  return validateBoost(record) ? null : record
}

export function parseBoostFields(fields: Array<number[] | Uint8Array>): BoostPayload | null {
  const start = magicIndex(fields)
  if (start < 0) return null
  try {
    const rest = fields.slice(start + 1).map((field) => fieldUtf8(field))
    if (rest.length < 3) return null
    if (rest[0] !== SCHEMA_VERSION) return null
    const kind = rest[1]
    if (kind === 'profile') {
      if (rest.length < 12) return null
      const profileFeeSats = integerAt(rest[9])
      if (profileFeeSats === null) return null
      const category = rest[3]
      if (!isCategory(category)) return null
      return profileFromParts({
        profileId: rest[2].toLowerCase(),
        category,
        name: rest[4],
        blurb: rest[5],
        link: rest[6],
        owner: rest[7],
        desk: rest[8],
        profileFeeSats,
        createdAt: rest[10],
        signature: rest[11].toLowerCase()
      })
    }
    if (kind === 'boost') {
      if (rest.length < 11) return null
      const hours = integerAt(rest[6])
      const paidSats = integerAt(rest[7])
      if (hours === null || paidSats === null) return null
      const pack = rest[5]
      if (!isBoostPack(pack)) return null
      return boostFromParts({
        profileId: rest[2].toLowerCase(),
        boostId: rest[3].toLowerCase(),
        owner: rest[4],
        pack,
        hours,
        paidSats,
        startsAt: rest[8],
        endsAt: rest[9],
        signature: rest[10].toLowerCase()
      })
    }
    return null
  } catch {
    return null
  }
}

/**
 * First valid profile for an owner and a normalized name wins.
 * A later payment under that same name stays on the overlay but is not a second listing.
 * The same profile id keeps the earliest created time.
 */
export function admitProfiles(profiles: ProfileRecord[]): ProfileRecord[] {
  const byId = new Map<string, ProfileRecord>()
  for (const row of profiles) {
    if (validateProfile(row)) continue
    const prev = byId.get(row.profileId)
    if (!prev || row.createdAt < prev.createdAt) byId.set(row.profileId, row)
  }
  const byKey = new Map<string, ProfileRecord>()
  for (const row of byId.values()) {
    const key = profileCollisionKey(row.owner, row.name)
    const prev = byKey.get(key)
    if (!prev || row.createdAt < prev.createdAt || (row.createdAt === prev.createdAt && row.profileId < prev.profileId)) {
      byKey.set(key, row)
    }
  }
  return [...byKey.values()]
}

export function collidingProfile(profiles: ProfileRecord[], candidate: ProfileRecord): ProfileRecord | null {
  const winner = admitProfiles([...profiles, candidate]).find((row) => (
    profileCollisionKey(row.owner, row.name) === profileCollisionKey(candidate.owner, candidate.name)
  ))
  if (!winner || winner.profileId === candidate.profileId) return null
  return winner
}

export function isDuplicateProfile(profiles: ProfileRecord[], candidate: ProfileRecord): boolean {
  return collidingProfile(profiles, candidate) !== null
}

/** Owner-signed boosts for this profile. One row per boost id. Other owners are ignored. */
export function admitBoosts(profile: ProfileRecord, boosts: BoostRecord[]): BoostRecord[] {
  if (validateProfile(profile)) return []
  const seen = new Set<string>()
  const rows = boosts
    .filter((row) => validateBoost(row) === null)
    .filter((row) => row.profileId === profile.profileId)
    .filter((row) => sameIdentity(row.owner, profile.owner))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt) || left.boostId.localeCompare(right.boostId))
  const unique: BoostRecord[] = []
  for (const row of rows) {
    if (seen.has(row.boostId)) continue
    seen.add(row.boostId)
    unique.push(row)
  }
  return unique
}

/** Open at startsAt, closed at endsAt. The window that ends latest wins. */
export function activeBoost(boosts: BoostRecord[], nowMs: number): BoostRecord | null {
  const open = boosts.filter((row) => {
    const start = Date.parse(row.startsAt)
    const end = Date.parse(row.endsAt)
    return Number.isFinite(start) && Number.isFinite(end) && start <= nowMs && nowMs < end
  })
  open.sort((left, right) => {
    if (left.endsAt !== right.endsAt) return right.endsAt.localeCompare(left.endsAt)
    if (left.paidSats !== right.paidSats) return right.paidSats - left.paidSats
    return left.startsAt.localeCompare(right.startsAt)
  })
  return open[0] ?? null
}

export function boostIsActive(row: BoostRecord, nowMs: number): boolean {
  const start = Date.parse(row.startsAt)
  const end = Date.parse(row.endsAt)
  return Number.isFinite(start) && Number.isFinite(end) && start <= nowMs && nowMs < end
}

/**
 * Boosted listings rank above the rest while a window is open.
 * After endsAt the listing falls back among the unboosted rows.
 */
export function rankDirectory(
  profiles: ProfileRecord[],
  boosts: BoostRecord[],
  nowMs: number
): RankedProfile[] {
  const admitted = admitProfiles(profiles)
  const rows = admitted.map((profile) => {
    const mine = admitBoosts(profile, boosts)
    const current = activeBoost(mine, nowMs)
    return { profile, activeBoost: current, boosted: current !== null }
  })
  rows.sort((left, right) => {
    if (left.boosted !== right.boosted) return left.boosted ? -1 : 1
    if (left.boosted && right.boosted && left.activeBoost && right.activeBoost) {
      if (left.activeBoost.endsAt !== right.activeBoost.endsAt) {
        return right.activeBoost.endsAt.localeCompare(left.activeBoost.endsAt)
      }
      if (left.activeBoost.paidSats !== right.activeBoost.paidSats) {
        return right.activeBoost.paidSats - left.activeBoost.paidSats
      }
    }
    if (left.profile.createdAt !== right.profile.createdAt) {
      return right.profile.createdAt.localeCompare(left.profile.createdAt)
    }
    return left.profile.name.localeCompare(right.profile.name)
  })
  return rows
}

export function buildReading(
  profile: ProfileRecord,
  boosts: BoostRecord[],
  nowMs: number,
  exportedAt: string
): BoostReading {
  const invalid = validateProfile(profile)
  if (invalid) throw new Error(invalid)
  const mine = admitBoosts(profile, boosts)
  const current = activeBoost(mine, nowMs)
  return {
    kind: 'boost-reading',
    profileId: profile.profileId,
    category: profile.category,
    name: profile.name,
    blurb: profile.blurb,
    link: profile.link,
    owner: profile.owner,
    desk: profile.desk,
    profileFeeSats: profile.profileFeeSats,
    createdAt: profile.createdAt,
    boosted: current !== null,
    activeUntil: current?.endsAt ?? null,
    boosts: mine.map((row) => ({
      boostId: row.boostId,
      pack: row.pack,
      hours: row.hours,
      paidSats: row.paidSats,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      active: boostIsActive(row, nowMs)
    })),
    exportedAt
  }
}

export function readingSlug(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return slug || 'boost'
}
