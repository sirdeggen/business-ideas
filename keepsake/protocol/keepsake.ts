/**
 * Keepsake Desk protocol (PushDrop fields).
 *
 * An org opens a fixed edition and mints numbered pieces. A piece is sent
 * to a recipient identity key. The holder can keep it, mark it for a public
 * profile, gift it, or resell it. v0 computes and records the issuer royalty
 * and the desk cut with floor math. It does not enforce that split in script.
 * The piece lock, when present, is the holder pubkey and OP_CHECKSIG.
 * OP_PUSH_TX output enforcement is v1.
 * Edition size is public on the overlay. MAGIC `keepsake`. Public Pages
 * uses tm_anytx / ls_anytx. Client filters on MAGIC. A mint counts only when
 * the issuer key signed it, the serial is inside the edition, and it is the
 * first signed record for that serial.
 *
 * Not Grants (a purpose-bound gift of money). Not Memberships (access).
 * Not Tickets (spent at the door). Not Vault Claim (a physical redeem).
 * Not Raffle (a random draw). Not Names (a username). Fixed editions only.
 */

import { BigNumber, ECDSA, Hash, PrivateKey, PublicKey, Signature } from '@bsv/sdk'
import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'keepsake']
export const BASKET = 'keepsake'
export const MAGIC = 'keepsake'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'keepsake'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'

export const NAME_MAX = 80
export const MIN_EDITION = 1
export const MAX_EDITION = 100_000
export const MIN_MINT_FEE_SATS = 0
export const MAX_MINT_FEE_SATS = 9_000_000_000_000
export const MIN_PRICE_SATS = 1
export const MAX_PRICE_SATS = 9_000_000_000_000
export const DEFAULT_MINT_FEE_SATS = 1_000
export const DEFAULT_ROYALTY_BPS = 500
export const DEFAULT_DESK_BPS = 200
export const MIN_FEE_BPS = 0
export const MAX_ROYALTY_BPS = 2_000
/** Desk cut stays under 5% (500 bps). */
export const MAX_DESK_BPS = 499
export const RECORD_SATS = 1
/** Holder signature check. v0 does not use this opcode to inspect outputs. */
export const OP_CHECKSIG = 0xac

export const OPENED_NOTE = 'Edition opened.'
export const MINTED_NOTE = 'Minted.'
export const SENT_NOTE = 'Sent. Message Box delivery waits until you record.'
export const GIFTED_NOTE = 'Gifted. A gift has no price, so the royalty on it is zero.'
export const SHOWN_NOTE = 'Marked for the public profile.'
export const RESOLD_NOTE = 'Resale kept. The desk recorded the royalty and the desk cut.'
export const EDITION_FULL = 'That edition is full. The count is fixed.'
export const ALREADY_SENT = 'That piece was already sent. Gift it on, or resell it.'
export const NOT_HOLDER = 'Only the current holder can do that.'

export const KINDS = ['edition', 'mint', 'send', 'gift', 'show', 'resale'] as const
export type KeepsakeKind = (typeof KINDS)[number]

export interface Edition {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'edition'
  keepsakeId: string
  orgName: string
  title: string
  editionSize: number
  mintFeeSats: number
  royaltyBps: number
  deskBps: number
  issuerKey: string
  openedAt: string
}

export interface MintRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'mint'
  keepsakeId: string
  serial: number
  mintFeeSats: number
  /** DER hex of the issuer signature. Empty on a local walkthrough mint. */
  issuerSig: string
  mintedAt: string
}

export interface SendRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'send'
  keepsakeId: string
  serial: number
  recipientKey: string
  sentAt: string
}

export interface GiftRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'gift'
  keepsakeId: string
  serial: number
  fromKey: string
  toKey: string
  giftedAt: string
}

export interface ShowRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'show'
  keepsakeId: string
  serial: number
  holderKey: string
  shownAt: string
}

export interface ResaleRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'resale'
  keepsakeId: string
  serial: number
  fromKey: string
  toKey: string
  priceSats: number
  royaltyBps: number
  royaltySats: number
  deskBps: number
  deskSats: number
  sellerSats: number
  lockHex: string
  resoldAt: string
}

export type KeepsakePayload = Edition | MintRecord | SendRecord | GiftRecord | ShowRecord | ResaleRecord

export interface DeskState {
  edition: Edition | null
  mints: MintRecord[]
  sends: SendRecord[]
  gifts: GiftRecord[]
  shows: ShowRecord[]
  resales: ResaleRecord[]
  rejection: string | null
  notice: string | null
}

export interface OpenInput {
  orgName: string
  title: string
  editionSize: number
  mintFeeSats: number
  royaltyBps: number
  deskBps: number
  issuerKey?: string
}

export interface ResaleSplit {
  priceSats: number
  royaltyBps: number
  royaltySats: number
  deskBps: number
  deskSats: number
  sellerSats: number
}

export interface HeldPiece {
  serial: number
  title: string
  editionSize: number
  holderKey: string
  shown: boolean
}

export interface BookEdition {
  keepsakeId: string
  edition: Edition
  mints: MintRecord[]
  sends: SendRecord[]
  gifts: GiftRecord[]
  shows: ShowRecord[]
  resales: ResaleRecord[]
}

const KEEPSAKE_ID = /^[0-9a-f]{32}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const IDENTITY_KEY = /^0[23][0-9a-f]{64}$/i
const LOCK_HEX = /^[0-9a-f]+$/i

export function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

export function isKeepsakeId(value: string): boolean {
  return KEEPSAKE_ID.test(value.trim().toLowerCase())
}

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  const date = new Date(trimmed)
  return !Number.isNaN(date.getTime())
}

export function newKeepsakeId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function identityFor(label: string): string {
  const digest = sha256Hex(`keepsake-desk\n${label.trim().toLowerCase()}`)
  return `02${digest}`
}

export const DESK_KEY = identityFor('keepsake-desk')
export const SAMPLE_RECIPIENT = identityFor('ada-holder')
export const SAMPLE_BUYER = identityFor('bea-buyer')

export function feeSatsOf(amountSats: number, feeBps: number): number {
  if (!Number.isSafeInteger(amountSats) || amountSats < 0) throw new Error('Enter an amount in sats.')
  if (!Number.isSafeInteger(feeBps) || feeBps < 0) throw new Error('Enter a fee in basis points.')
  return Number((BigInt(amountSats) * BigInt(feeBps)) / 10_000n)
}

export function resaleSplit(priceSats: number, royaltyBps: number, deskBps: number): ResaleSplit {
  assertPrice(priceSats)
  assertRoyaltyBps(royaltyBps)
  assertDeskBps(deskBps)
  const royaltySats = feeSatsOf(priceSats, royaltyBps)
  const deskSats = feeSatsOf(priceSats, deskBps)
  const sellerSats = priceSats - royaltySats - deskSats
  if (sellerSats < 0) throw new Error('The royalty and desk cut exceed the price.')
  return { priceSats, royaltyBps, royaltySats, deskBps, deskSats, sellerSats }
}

export function emptyDesk(): DeskState {
  return {
    edition: null,
    mints: [],
    sends: [],
    gifts: [],
    shows: [],
    resales: [],
    rejection: null,
    notice: null
  }
}

export function keepMagic<T extends { magic: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.magic === MAGIC)
}

export function supplyOf(state: Pick<DeskState, 'edition' | 'mints'>): { editionSize: number, minted: number, remaining: number } {
  const editionSize = state.edition?.editionSize ?? 0
  const minted = state.mints.length
  return { editionSize, minted, remaining: Math.max(0, editionSize - minted) }
}

function assertName(name: string, empty: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error(empty)
  if (trimmed.length > NAME_MAX) throw new Error(`Keep the name to ${NAME_MAX} characters.`)
  return trimmed
}

export function assertEditionSize(editionSize: number): void {
  if (!Number.isInteger(editionSize) || editionSize < MIN_EDITION || editionSize > MAX_EDITION) {
    throw new Error(`Edition size is a fixed whole number from ${MIN_EDITION} to ${MAX_EDITION}.`)
  }
}

export function assertMintFee(mintFeeSats: number): void {
  if (!Number.isInteger(mintFeeSats) || mintFeeSats < MIN_MINT_FEE_SATS || mintFeeSats > MAX_MINT_FEE_SATS) {
    throw new Error('Enter a mint fee in sats.')
  }
}

export function assertRoyaltyBps(royaltyBps: number): void {
  if (!Number.isInteger(royaltyBps) || royaltyBps < MIN_FEE_BPS || royaltyBps > MAX_ROYALTY_BPS) {
    throw new Error(`Issuer royalty must be a whole number of basis points from ${MIN_FEE_BPS} to ${MAX_ROYALTY_BPS}.`)
  }
}

export function assertDeskBps(deskBps: number): void {
  if (!Number.isInteger(deskBps) || deskBps < MIN_FEE_BPS || deskBps > MAX_DESK_BPS) {
    throw new Error('Desk cut must be under 5% (0 to 499 basis points).')
  }
}

export function assertPrice(priceSats: number): void {
  if (!Number.isInteger(priceSats) || priceSats < MIN_PRICE_SATS || priceSats > MAX_PRICE_SATS) {
    throw new Error('Enter a price in sats.')
  }
}

export function assertKey(value: string, label: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!isIdentityKey(trimmed)) throw new Error(`Enter the ${label} identity key.`)
  return trimmed
}

function requireEdition(state: DeskState): Edition {
  if (!state.edition) throw new Error('Open an edition first.')
  return state.edition
}

function eventOrder(state: DeskState, serial: number): Array<{ at: string, seq: number, holder: string }> {
  const edition = state.edition
  if (!edition) return []
  const rows: Array<{ at: string, seq: number, holder: string }> = []
  let seq = 0
  for (const mint of state.mints) {
    if (mint.serial !== serial) continue
    rows.push({ at: mint.mintedAt, seq: seq++, holder: edition.issuerKey })
  }
  for (const send of state.sends) {
    if (send.serial !== serial) continue
    rows.push({ at: send.sentAt, seq: seq++, holder: send.recipientKey })
  }
  for (const gift of state.gifts) {
    if (gift.serial !== serial) continue
    rows.push({ at: gift.giftedAt, seq: seq++, holder: gift.toKey })
  }
  for (const resale of state.resales) {
    if (resale.serial !== serial) continue
    rows.push({ at: resale.resoldAt, seq: seq++, holder: resale.toKey })
  }
  return rows.sort((left, right) => {
    if (left.at === right.at) return left.seq - right.seq
    return left.at < right.at ? -1 : 1
  })
}

export function holderOf(state: DeskState, serial: number): string | null {
  const rows = eventOrder(state, serial)
  return rows.at(-1)?.holder ?? null
}

export function wasSent(state: DeskState, serial: number): boolean {
  return state.sends.some((row) => row.serial === serial)
}

export function profileOf(state: DeskState, holderKey: string): HeldPiece[] {
  if (!state.edition || !isIdentityKey(holderKey)) return []
  const key = holderKey.trim().toLowerCase()
  return state.mints.flatMap((mint) => {
    const holder = holderOf(state, mint.serial)
    if (!holder || holder.toLowerCase() !== key) return []
    const shown = state.shows.some((row) => row.serial === mint.serial && row.holderKey.toLowerCase() === key)
    return [{
      serial: mint.serial,
      title: state.edition!.title,
      editionSize: state.edition!.editionSize,
      holderKey: holder,
      shown
    }]
  })
}

export function openEdition(input: OpenInput, now = nowIso(), keepsakeId = newKeepsakeId()): DeskState {
  const orgName = assertName(input.orgName, 'Name the org.')
  const title = assertName(input.title, 'Name the keepsake.')
  assertEditionSize(input.editionSize)
  assertMintFee(input.mintFeeSats)
  assertRoyaltyBps(input.royaltyBps)
  assertDeskBps(input.deskBps)
  const issuerKey = input.issuerKey ? assertKey(input.issuerKey, 'issuer') : identityFor(orgName)
  if (!isKeepsakeId(keepsakeId)) throw new Error('Keepsake id is missing.')
  const edition: Edition = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'edition',
    keepsakeId,
    orgName,
    title,
    editionSize: input.editionSize,
    mintFeeSats: input.mintFeeSats,
    royaltyBps: input.royaltyBps,
    deskBps: input.deskBps,
    issuerKey,
    openedAt: now
  }
  const invalid = validateEdition(edition)
  if (invalid) throw new Error(invalid)
  return { ...emptyDesk(), edition, notice: OPENED_NOTE }
}

export function mintPiece(state: DeskState, now = nowIso()): DeskState {
  const edition = requireEdition(state)
  if (state.mints.length >= edition.editionSize) {
    return { ...state, rejection: EDITION_FULL, notice: null }
  }
  const serial = state.mints.length + 1
  const mint: MintRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'mint',
    keepsakeId: edition.keepsakeId,
    serial,
    mintFeeSats: edition.mintFeeSats,
    issuerSig: '',
    mintedAt: now
  }
  const invalid = validateMint(mint, edition.editionSize)
  if (invalid) throw new Error(invalid)
  return { ...state, mints: [...state.mints, mint], rejection: null, notice: MINTED_NOTE }
}

export function sendPiece(state: DeskState, serial: number, recipientKey: string, now = nowIso()): DeskState {
  const edition = requireEdition(state)
  let recipient = ''
  try {
    assertSerial(serial, edition.editionSize)
    recipient = assertKey(recipientKey, 'recipient')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Enter the recipient identity key.'
    return { ...state, rejection: message, notice: null }
  }
  if (!state.mints.some((row) => row.serial === serial)) {
    return { ...state, rejection: 'Mint that piece first.', notice: null }
  }
  if (wasSent(state, serial) || holderOf(state, serial) !== edition.issuerKey) {
    return { ...state, rejection: ALREADY_SENT, notice: null }
  }
  const send: SendRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'send',
    keepsakeId: edition.keepsakeId,
    serial,
    recipientKey: recipient,
    sentAt: now
  }
  const invalid = validateSend(send)
  if (invalid) throw new Error(invalid)
  return { ...state, sends: [...state.sends, send], rejection: null, notice: SENT_NOTE }
}

export function giftPiece(state: DeskState, serial: number, toKey: string, now = nowIso()): DeskState {
  const edition = requireEdition(state)
  let recipient = ''
  try {
    assertSerial(serial, edition.editionSize)
    recipient = assertKey(toKey, 'recipient')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Enter the recipient identity key.'
    return { ...state, rejection: message, notice: null }
  }
  const holder = holderOf(state, serial)
  if (!holder) return { ...state, rejection: 'Mint that piece first.', notice: null }
  if (recipient === holder) return { ...state, rejection: 'Gift it to a different identity key.', notice: null }
  const gift: GiftRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'gift',
    keepsakeId: edition.keepsakeId,
    serial,
    fromKey: holder,
    toKey: recipient,
    giftedAt: now
  }
  const invalid = validateGift(gift)
  if (invalid) throw new Error(invalid)
  return { ...state, gifts: [...state.gifts, gift], rejection: null, notice: GIFTED_NOTE }
}

export function showPiece(state: DeskState, serial: number, now = nowIso()): DeskState {
  const edition = requireEdition(state)
  try {
    assertSerial(serial, edition.editionSize)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'That piece is missing.'
    return { ...state, rejection: message, notice: null }
  }
  const holder = holderOf(state, serial)
  if (!holder) return { ...state, rejection: 'Mint that piece first.', notice: null }
  const show: ShowRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'show',
    keepsakeId: edition.keepsakeId,
    serial,
    holderKey: holder,
    shownAt: now
  }
  const invalid = validateShow(show)
  if (invalid) throw new Error(invalid)
  return { ...state, shows: [...state.shows, show], rejection: null, notice: SHOWN_NOTE }
}

export function resellPiece(
  state: DeskState,
  serial: number,
  toKey: string,
  priceSats: number,
  now = nowIso()
): DeskState {
  const edition = requireEdition(state)
  let buyer = ''
  let split: ResaleSplit
  try {
    assertSerial(serial, edition.editionSize)
    buyer = assertKey(toKey, 'buyer')
    split = resaleSplit(priceSats, edition.royaltyBps, edition.deskBps)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Enter a price in sats.'
    return { ...state, rejection: message, notice: null }
  }
  const holder = holderOf(state, serial)
  if (!holder) return { ...state, rejection: 'Mint that piece first.', notice: null }
  if (buyer === holder) return { ...state, rejection: 'Resell it to a different identity key.', notice: null }
  const lock = pieceLock(holder)
  const resale: ResaleRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'resale',
    keepsakeId: edition.keepsakeId,
    serial,
    fromKey: holder,
    toKey: buyer,
    priceSats: split.priceSats,
    royaltyBps: split.royaltyBps,
    royaltySats: split.royaltySats,
    deskBps: split.deskBps,
    deskSats: split.deskSats,
    sellerSats: split.sellerSats,
    lockHex: lock,
    resoldAt: now
  }
  const invalid = validateResale(resale)
  if (invalid) throw new Error(invalid)
  return { ...state, resales: [...state.resales, resale], rejection: null, notice: RESOLD_NOTE }
}

function assertSerial(serial: number, editionSize: number): void {
  if (!Number.isInteger(serial) || serial < 1 || serial > editionSize) {
    throw new Error('That piece is not in this edition.')
  }
}

export function validateEdition(edition: Edition): string | null {
  if (edition.magic !== MAGIC || edition.kind !== 'edition') return 'Not a keepsake edition.'
  if (edition.version !== SCHEMA_VERSION) return 'Not this keepsake version.'
  if (!isKeepsakeId(edition.keepsakeId)) return 'Keepsake id is missing.'
  if (!edition.orgName.trim() || edition.orgName.length > NAME_MAX) return 'The org name is missing.'
  if (!edition.title.trim() || edition.title.length > NAME_MAX) return 'The keepsake name is missing.'
  if (!isIdentityKey(edition.issuerKey)) return 'Issuer key is missing.'
  try {
    assertEditionSize(edition.editionSize)
    assertMintFee(edition.mintFeeSats)
    assertRoyaltyBps(edition.royaltyBps)
    assertDeskBps(edition.deskBps)
  } catch (error) {
    return error instanceof Error ? error.message : 'Edition is invalid.'
  }
  if (!isIsoDateTime(edition.openedAt)) return 'Opened time is missing.'
  return null
}

export function validateMint(mint: MintRecord, editionSize = MAX_EDITION): string | null {
  if (mint.magic !== MAGIC || mint.kind !== 'mint') return 'Not a mint.'
  if (!isKeepsakeId(mint.keepsakeId)) return 'Keepsake id is missing.'
  try {
    assertSerial(mint.serial, editionSize)
    assertMintFee(mint.mintFeeSats)
  } catch (error) {
    return error instanceof Error ? error.message : 'Mint is invalid.'
  }
  if (mint.issuerSig !== '' && !/^[0-9a-f]+$/i.test(mint.issuerSig)) return 'Mint signature is missing.'
  if (!isIsoDateTime(mint.mintedAt)) return 'Minted time is missing.'
  return null
}

export function validateSend(send: SendRecord): string | null {
  if (send.magic !== MAGIC || send.kind !== 'send') return 'Not a send.'
  if (!isKeepsakeId(send.keepsakeId)) return 'Keepsake id is missing.'
  if (!Number.isInteger(send.serial) || send.serial < 1) return 'Serial is missing.'
  if (!isIdentityKey(send.recipientKey)) return 'Recipient key is missing.'
  if (!isIsoDateTime(send.sentAt)) return 'Sent time is missing.'
  return null
}

export function validateGift(gift: GiftRecord): string | null {
  if (gift.magic !== MAGIC || gift.kind !== 'gift') return 'Not a gift.'
  if (!isKeepsakeId(gift.keepsakeId)) return 'Keepsake id is missing.'
  if (!Number.isInteger(gift.serial) || gift.serial < 1) return 'Serial is missing.'
  if (!isIdentityKey(gift.fromKey) || !isIdentityKey(gift.toKey)) return 'Gift keys are missing.'
  if (gift.fromKey === gift.toKey) return 'Gift it to a different identity key.'
  if (!isIsoDateTime(gift.giftedAt)) return 'Gifted time is missing.'
  return null
}

export function validateShow(show: ShowRecord): string | null {
  if (show.magic !== MAGIC || show.kind !== 'show') return 'Not a profile mark.'
  if (!isKeepsakeId(show.keepsakeId)) return 'Keepsake id is missing.'
  if (!Number.isInteger(show.serial) || show.serial < 1) return 'Serial is missing.'
  if (!isIdentityKey(show.holderKey)) return 'Holder key is missing.'
  if (!isIsoDateTime(show.shownAt)) return 'Shown time is missing.'
  return null
}

export function validateResale(resale: ResaleRecord): string | null {
  if (resale.magic !== MAGIC || resale.kind !== 'resale') return 'Not a resale.'
  if (!isKeepsakeId(resale.keepsakeId)) return 'Keepsake id is missing.'
  if (!Number.isInteger(resale.serial) || resale.serial < 1) return 'Serial is missing.'
  if (!isIdentityKey(resale.fromKey) || !isIdentityKey(resale.toKey)) return 'Resale keys are missing.'
  if (resale.fromKey === resale.toKey) return 'Resell it to a different identity key.'
  let split: ResaleSplit
  try {
    split = resaleSplit(resale.priceSats, resale.royaltyBps, resale.deskBps)
  } catch (error) {
    return error instanceof Error ? error.message : 'Price is invalid.'
  }
  if (resale.royaltySats !== split.royaltySats || resale.deskSats !== split.deskSats || resale.sellerSats !== split.sellerSats) {
    return 'Fee lines do not add up.'
  }
  if (!LOCK_HEX.test(resale.lockHex)) return 'Piece lock is missing.'
  if (resale.lockHex.toLowerCase() !== pieceLock(resale.fromKey)) return 'Piece lock does not match the holder.'
  if (!isIsoDateTime(resale.resoldAt)) return 'Resale time is missing.'
  return null
}

function encodeHead(kind: KeepsakeKind, keepsakeId: string): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes(kind),
    stringToUtf8Bytes(keepsakeId)
  ]
}

export function encodeEditionFields(edition: Edition): number[][] {
  const invalid = validateEdition(edition)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('edition', edition.keepsakeId),
    stringToUtf8Bytes(edition.orgName),
    stringToUtf8Bytes(edition.title),
    stringToUtf8Bytes(String(edition.editionSize)),
    stringToUtf8Bytes(String(edition.mintFeeSats)),
    stringToUtf8Bytes(String(edition.royaltyBps)),
    stringToUtf8Bytes(String(edition.deskBps)),
    stringToUtf8Bytes(edition.issuerKey),
    stringToUtf8Bytes(edition.openedAt)
  ]
}

export function encodeMintFields(mint: MintRecord): number[][] {
  const invalid = validateMint(mint)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('mint', mint.keepsakeId),
    stringToUtf8Bytes(String(mint.serial)),
    stringToUtf8Bytes(String(mint.mintFeeSats)),
    stringToUtf8Bytes(mint.issuerSig),
    stringToUtf8Bytes(mint.mintedAt)
  ]
}

export function encodeSendFields(send: SendRecord): number[][] {
  const invalid = validateSend(send)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('send', send.keepsakeId),
    stringToUtf8Bytes(String(send.serial)),
    stringToUtf8Bytes(send.recipientKey),
    stringToUtf8Bytes(send.sentAt)
  ]
}

export function encodeGiftFields(gift: GiftRecord): number[][] {
  const invalid = validateGift(gift)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('gift', gift.keepsakeId),
    stringToUtf8Bytes(String(gift.serial)),
    stringToUtf8Bytes(gift.fromKey),
    stringToUtf8Bytes(gift.toKey),
    stringToUtf8Bytes(gift.giftedAt)
  ]
}

export function encodeShowFields(show: ShowRecord): number[][] {
  const invalid = validateShow(show)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('show', show.keepsakeId),
    stringToUtf8Bytes(String(show.serial)),
    stringToUtf8Bytes(show.holderKey),
    stringToUtf8Bytes(show.shownAt)
  ]
}

export function encodeResaleFields(resale: ResaleRecord): number[][] {
  const invalid = validateResale(resale)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('resale', resale.keepsakeId),
    stringToUtf8Bytes(String(resale.serial)),
    stringToUtf8Bytes(resale.fromKey),
    stringToUtf8Bytes(resale.toKey),
    stringToUtf8Bytes(String(resale.priceSats)),
    stringToUtf8Bytes(String(resale.royaltyBps)),
    stringToUtf8Bytes(String(resale.royaltySats)),
    stringToUtf8Bytes(String(resale.deskBps)),
    stringToUtf8Bytes(String(resale.deskSats)),
    stringToUtf8Bytes(String(resale.sellerSats)),
    stringToUtf8Bytes(resale.lockHex),
    stringToUtf8Bytes(resale.resoldAt)
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

export function parseKeepsakeFields(fields: Array<number[] | Uint8Array>): KeepsakePayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3 || rest[0] !== SCHEMA_VERSION) return null
  const kind = rest[1]
  const keepsakeId = rest[2]
  if (kind === 'edition') {
    if (rest.length < 11) return null
    const editionSize = whole(rest[5])
    const mintFeeSats = whole(rest[6])
    const royaltyBps = whole(rest[7])
    const deskBps = whole(rest[8])
    if (editionSize == null || mintFeeSats == null || royaltyBps == null || deskBps == null) return null
    const edition: Edition = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'edition',
      keepsakeId,
      orgName: rest[3],
      title: rest[4],
      editionSize,
      mintFeeSats,
      royaltyBps,
      deskBps,
      issuerKey: rest[9],
      openedAt: rest[10]
    }
    return validateEdition(edition) ? null : edition
  }
  if (kind === 'mint') {
    if (rest.length < 7) return null
    const serial = whole(rest[3])
    const mintFeeSats = whole(rest[4])
    if (serial == null || mintFeeSats == null) return null
    const mint: MintRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'mint',
      keepsakeId,
      serial,
      mintFeeSats,
      issuerSig: rest[5],
      mintedAt: rest[6]
    }
    return validateMint(mint) ? null : mint
  }
  if (kind === 'send') {
    if (rest.length < 6) return null
    const serial = whole(rest[3])
    if (serial == null) return null
    const send: SendRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'send',
      keepsakeId,
      serial,
      recipientKey: rest[4],
      sentAt: rest[5]
    }
    return validateSend(send) ? null : send
  }
  if (kind === 'gift') {
    if (rest.length < 7) return null
    const serial = whole(rest[3])
    if (serial == null) return null
    const gift: GiftRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'gift',
      keepsakeId,
      serial,
      fromKey: rest[4],
      toKey: rest[5],
      giftedAt: rest[6]
    }
    return validateGift(gift) ? null : gift
  }
  if (kind === 'show') {
    if (rest.length < 6) return null
    const serial = whole(rest[3])
    if (serial == null) return null
    const show: ShowRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'show',
      keepsakeId,
      serial,
      holderKey: rest[4],
      shownAt: rest[5]
    }
    return validateShow(show) ? null : show
  }
  if (kind === 'resale') {
    if (rest.length < 14) return null
    const serial = whole(rest[3])
    const priceSats = whole(rest[6])
    const royaltyBps = whole(rest[7])
    const royaltySats = whole(rest[8])
    const deskBps = whole(rest[9])
    const deskSats = whole(rest[10])
    const sellerSats = whole(rest[11])
    if (
      serial == null || priceSats == null || royaltyBps == null || royaltySats == null
      || deskBps == null || deskSats == null || sellerSats == null
    ) return null
    const resale: ResaleRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'resale',
      keepsakeId,
      serial,
      fromKey: rest[4],
      toKey: rest[5],
      priceSats,
      royaltyBps,
      royaltySats,
      deskBps,
      deskSats,
      sellerSats,
      lockHex: rest[12],
      resoldAt: rest[13]
    }
    return validateResale(resale) ? null : resale
  }
  return null
}

export function deskFromRecords(records: KeepsakePayload[], keepsakeId?: string): DeskState | null {
  const scoped = keepMagic(keepsakeId ? records.filter((row) => row.keepsakeId === keepsakeId) : records)
  const edition = scoped.find((row): row is Edition => row.kind === 'edition') ?? null
  if (!edition) return null
  const mine = scoped.filter((row) => row.keepsakeId === edition.keepsakeId)
  return {
    ...emptyDesk(),
    edition,
    mints: acceptedMints(mine.filter((row): row is MintRecord => row.kind === 'mint'), edition),
    sends: mine.filter((row): row is SendRecord => row.kind === 'send'),
    gifts: mine.filter((row): row is GiftRecord => row.kind === 'gift'),
    shows: mine.filter((row): row is ShowRecord => row.kind === 'show'),
    resales: mine.filter((row): row is ResaleRecord => row.kind === 'resale')
  }
}

export function bookFromRecords(records: KeepsakePayload[]): BookEdition[] {
  const editions = keepMagic(records).filter((row): row is Edition => row.kind === 'edition')
  const ids = [...new Set(editions.map((row) => row.keepsakeId))]
  return ids.flatMap((id) => {
    const desk = deskFromRecords(records, id)
    if (!desk?.edition) return []
    return [{
      keepsakeId: id,
      edition: desk.edition,
      mints: desk.mints,
      sends: desk.sends,
      gifts: desk.gifts,
      shows: desk.shows,
      resales: desk.resales
    }]
  })
}

export function mintedCount(records: KeepsakePayload[], keepsakeId: string): number {
  return deskFromRecords(records, keepsakeId)?.mints.length ?? 0
}

export function mintMessage(mint: Pick<MintRecord, 'keepsakeId' | 'serial' | 'mintFeeSats' | 'mintedAt'>): number[] {
  return stringToUtf8Bytes([
    'keepsake',
    'mint',
    mint.keepsakeId,
    String(mint.serial),
    String(mint.mintFeeSats),
    mint.mintedAt
  ].join('\n'))
}

export function issuerSigFor(
  privateKey: PrivateKey,
  mint: Pick<MintRecord, 'keepsakeId' | 'serial' | 'mintFeeSats' | 'mintedAt'>
): string {
  const der = privateKey.sign(mintMessage(mint)).toDER('hex')
  if (typeof der !== 'string') throw new Error('Mint signature is missing.')
  return der
}

function hexToBytes(value: string): number[] | null {
  const trimmed = value.trim().toLowerCase()
  if (!/^[0-9a-f]+$/.test(trimmed) || trimmed.length < 16 || trimmed.length % 2 !== 0) return null
  const out: number[] = []
  for (let index = 0; index < trimmed.length; index += 2) {
    out.push(Number.parseInt(trimmed.slice(index, index + 2), 16))
  }
  return out
}

/** True only when issuerSig verifies against the edition issuer key. */
export function mintSignedByIssuer(mint: MintRecord, issuerKey: string): boolean {
  if (!isIdentityKey(issuerKey)) return false
  const der = hexToBytes(mint.issuerSig)
  if (!der) return false
  try {
    const hash = Hash.sha256(mintMessage(mint))
    const key = PublicKey.fromString(issuerKey.trim())
    const signature = Signature.fromDER(der)
    return ECDSA.verify(new BigNumber(hash), signature, key)
  } catch {
    return false
  }
}

/**
 * Fixed edition on read: drop serials outside 1..editionSize, drop mints the
 * issuer key did not sign, then keep the first signed record for each serial.
 */
export function acceptedMints(mints: MintRecord[], edition: Edition): MintRecord[] {
  const seen = new Set<number>()
  const kept: MintRecord[] = []
  for (const mint of mints) {
    if (!Number.isInteger(mint.serial) || mint.serial < 1 || mint.serial > edition.editionSize) continue
    if (!mintSignedByIssuer(mint, edition.issuerKey)) continue
    if (seen.has(mint.serial)) continue
    seen.add(mint.serial)
    kept.push(mint)
  }
  return kept
}

/**
 * v0 piece lock: the holder compressed pubkey and OP_CHECKSIG.
 * It requires the holder's signature. It does not read the spending
 * transaction's outputs, and it does not check the royalty or the desk cut.
 * The desk computes and records that split. OP_PUSH_TX output enforcement is v1.
 */
export function pieceLock(holderKey: string): string {
  const key = holderKey.trim().toLowerCase()
  if (!isIdentityKey(key)) throw new Error('Holder key is missing.')
  return `21${key}ac`
}
