import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DESK_BPS,
  DEFAULT_MINT_FEE_SATS,
  DEFAULT_ROYALTY_BPS,
  EDITION_FULL,
  MAGIC,
  MAX_DESK_BPS,
  PROTOCOL_ID,
  OP_CHECKSIG,
  SAMPLE_BUYER,
  SAMPLE_RECIPIENT,
  SIGNING_COUNTERPARTY,
  SIGNING_KEY_ID,
  bookFromRecords,
  deskFromRecords,
  encodeEditionFields,
  encodeGiftFields,
  encodeMintFields,
  encodeResaleFields,
  encodeSendFields,
  encodeShowFields,
  feeSatsOf,
  giftPiece,
  holderOf,
  identityFor,
  keepMagic,
  mintedCount,
  mintMessage,
  mintPiece,
  openEdition,
  parseKeepsakeFields,
  pieceLock,
  profileOf,
  resaleSplit,
  resellPiece,
  sendPiece,
  showPiece,
  signRecordedDesk,
  stringToUtf8Bytes,
  supplyOf,
  type MintRecord,
  type RecordSigner
} from './keepsake'

const NOW = '2026-10-13T16:00:00Z'
const LATER = '2026-10-13T16:05:00Z'
const AFTER = '2026-10-13T16:10:00Z'
const ID = 'ab'.repeat(16)

function opened(editionSize = 2, issuerKey?: string) {
  return openEdition({
    orgName: 'North Hall Volunteers',
    title: 'Founding Volunteer 2026',
    editionSize,
    mintFeeSats: DEFAULT_MINT_FEE_SATS,
    royaltyBps: DEFAULT_ROYALTY_BPS,
    deskBps: DEFAULT_DESK_BPS,
    issuerKey
  }, NOW, ID)
}

function walletOf(key = PrivateKey.fromRandom()): { wallet: RecordSigner, identityPromise: Promise<string> } {
  const wallet = new ProtoWallet(key)
  return {
    wallet,
    identityPromise: wallet.getPublicKey({ identityKey: true }).then((result) => result.publicKey)
  }
}

async function signMint(wallet: RecordSigner, mint: MintRecord, patch: Partial<MintRecord> = {}): Promise<MintRecord> {
  const next = { ...mint, ...patch, issuerSig: '' }
  const { signature } = await wallet.createSignature({
    data: mintMessage(next),
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: SIGNING_COUNTERPARTY
  })
  return { ...next, issuerSig: signature.map((byte) => byte.toString(16).padStart(2, '0')).join('') }
}

describe('keepsake protocol', () => {
  it('floors the issuer royalty and the desk cut, and keeps the desk cut under 5%', () => {
    expect(feeSatsOf(10_001, 500)).toBe(500)
    expect(feeSatsOf(1, 500)).toBe(0)
    expect(feeSatsOf(10_000, 200)).toBe(200)
    expect(feeSatsOf(199, 200)).toBe(3)
    const split = resaleSplit(10_000, 500, 200)
    expect(split).toEqual({
      priceSats: 10_000,
      royaltyBps: 500,
      royaltySats: 500,
      deskBps: 200,
      deskSats: 200,
      sellerSats: 9_300
    })
    expect(500 + 200 + 9_300).toBe(10_000)
    expect(MAX_DESK_BPS).toBeLessThan(500)
    expect(() => resaleSplit(10_000, 500, 500)).toThrow(/under 5%/)
    expect(() => resaleSplit(10_000, 2_001, 200)).toThrow(/royalty/i)
  })

  it('stops minting when the fixed edition is full', () => {
    let desk = opened(2)
    expect(supplyOf(desk)).toEqual({ editionSize: 2, minted: 0, remaining: 2 })
    desk = mintPiece(desk, NOW)
    desk = mintPiece(desk, LATER)
    expect(desk.mints.map((row) => row.serial)).toEqual([1, 2])
    expect(supplyOf(desk).remaining).toBe(0)
    expect(desk.edition?.editionSize).toBe(2)
    desk = mintPiece(desk, AFTER)
    expect(desk.mints).toHaveLength(2)
    expect(desk.rejection).toBe(EDITION_FULL)
  })

  it('round-trips edition, mint, send, gift, show, and resale fields', async () => {
    const { wallet } = walletOf()
    let desk = opened(500)
    desk = mintPiece(desk, NOW)
    desk = sendPiece(desk, 1, SAMPLE_RECIPIENT, LATER)
    desk = showPiece(desk, 1, LATER)
    desk = resellPiece(desk, 1, SAMPLE_BUYER, 10_000, AFTER)
    expect(desk.mints[0]?.issuerSig).toBe('')
    expect(desk.edition?.issuerSig).toBe('')
    expect(parseKeepsakeFields(encodeEditionFields(desk.edition!))).toEqual(desk.edition)
    expect(parseKeepsakeFields(encodeMintFields(desk.mints[0]))).toEqual(desk.mints[0])
    expect(parseKeepsakeFields(encodeSendFields(desk.sends[0]))).toEqual(desk.sends[0])
    expect(parseKeepsakeFields(encodeShowFields(desk.shows[0]))).toEqual(desk.shows[0])
    expect(parseKeepsakeFields(encodeResaleFields(desk.resales[0]))).toEqual(desk.resales[0])
    desk = await signRecordedDesk(wallet, desk)
    expect(parseKeepsakeFields(encodeEditionFields(desk.edition!))).toEqual(desk.edition)
    expect(parseKeepsakeFields(encodeMintFields(desk.mints[0]))).toEqual(desk.mints[0])
    const restored = deskFromRecords([
      desk.edition!,
      desk.mints[0],
      desk.sends[0],
      desk.shows[0],
      desk.resales[0]
    ], ID)
    expect(restored?.edition?.title).toBe('Founding Volunteer 2026')
    expect(holderOf(restored!, 1)).toBe(SAMPLE_BUYER)
    expect(profileOf(desk, SAMPLE_RECIPIENT)).toEqual([])
    expect(profileOf(desk, SAMPLE_BUYER)[0]?.shown).toBe(false)
  })

  it('locks the piece to the holder signature and leaves the split to the desk', () => {
    const lock = pieceLock(SAMPLE_RECIPIENT)
    expect(lock).toBe(`21${SAMPLE_RECIPIENT}ac`)
    expect(lock.endsWith(OP_CHECKSIG.toString(16))).toBe(true)
    expect(pieceLock(SAMPLE_RECIPIENT.toUpperCase())).toBe(lock)
    const desk = opened()
    const resold = resellPiece(mintPiece(desk, NOW), 1, SAMPLE_BUYER, 10_000, LATER)
    expect(resold.resales[0]?.lockHex).toBe(pieceLock(desk.edition!.issuerKey))
    expect(resold.resales[0]).toMatchObject({ royaltySats: 500, deskSats: 200, sellerSats: 9_300 })
  })

  it('drops mints above the edition size when reading the records', async () => {
    const { wallet } = walletOf()
    const recorded = await signRecordedDesk(wallet, mintPiece(opened(2), NOW))
    const mint = recorded.mints[0]!
    const inside = await signMint(wallet, mint, { serial: 2 })
    const above = await signMint(wallet, mint, { serial: 3 })
    const records = [recorded.edition!, inside, above]
    expect(deskFromRecords(records, ID)?.mints).toEqual([inside])
    expect(bookFromRecords(records)[0]?.mints).toEqual([inside])
    expect(mintedCount(records, ID)).toBe(1)
  })

  it('keeps the oldest signed mint for a serial and drops the later duplicate', async () => {
    const { wallet } = walletOf()
    const recorded = await signRecordedDesk(wallet, mintPiece(opened(2), NOW))
    const mint = recorded.mints[0]!
    const first = mint
    const duplicate = await signMint(wallet, mint, { mintedAt: LATER })
    const records = [recorded.edition!, duplicate, first]
    expect(deskFromRecords(records, ID)?.mints).toEqual([first])
    expect(bookFromRecords(records)[0]?.mints).toEqual([first])
    expect(mintedCount(records, ID)).toBe(1)
    expect(first.issuerSig).not.toBe(duplicate.issuerSig)
  })

  it('accepts only mints signed by the issuer key', async () => {
    const issuer = walletOf()
    const stranger = walletOf()
    const recorded = await signRecordedDesk(issuer.wallet, mintPiece(opened(2), NOW))
    const mint = recorded.mints[0]!
    const signed = mint
    const foreign = await signMint(stranger.wallet, mint, { serial: 2 })
    const unsigned = { ...mint, serial: 2, issuerSig: '' }
    const records = [
      recorded.edition!,
      unsigned,
      foreign,
      signed,
      { magic: 'raffle', kind: 'mint', keepsakeId: ID, serial: 1 } as never
    ]
    expect(deskFromRecords(records, ID)?.mints).toEqual([signed])
    expect(bookFromRecords(records)[0]?.mints).toEqual([signed])
    expect(mintedCount(records, ID)).toBe(1)
    expect(mintedCount([signed], ID)).toBe(0)
    const later = await signMint(issuer.wallet, mint, { serial: 1, mintedAt: LATER })
    const sameSerial = [
      recorded.edition!,
      { ...mint, serial: 1, issuerSig: '' },
      later
    ]
    expect(deskFromRecords(sameSerial, ID)?.mints.map((row) => row.mintedAt)).toEqual([LATER])
    expect(bookFromRecords(sameSerial)[0]?.mints).toHaveLength(1)
    expect(mintedCount(sameSerial, ID)).toBe(1)
  })

  it('a recorded mint survives deskFromRecords and the public book shows 1', async () => {
    const { wallet, identityPromise } = walletOf()
    let desk = opened(500)
    expect(desk.edition?.issuerKey).toBe(identityFor('North Hall Volunteers'))
    desk = mintPiece(desk, NOW)
    const recorded = await signRecordedDesk(wallet, desk)
    expect(recorded.edition?.issuerKey).toBe(await identityPromise)
    expect(recorded.edition?.issuerKey).not.toBe(identityFor('North Hall Volunteers'))
    const records = [recorded.edition!, ...recorded.mints]
    expect(deskFromRecords(records, recorded.edition!.keepsakeId)?.mints).toHaveLength(1)
    expect(bookFromRecords(records)[0]?.mints).toHaveLength(1)
    expect(mintedCount(records, recorded.edition!.keepsakeId)).toBe(1)
  })

  it('ignores a later edition that reuses the keepsake id', async () => {
    const org = walletOf()
    const attacker = walletOf()
    const recorded = await signRecordedDesk(org.wallet, mintPiece(opened(2), NOW))
    const attack = openEdition({
      orgName: 'North Hall Volunteers',
      title: 'Taken over',
      editionSize: 9_000,
      mintFeeSats: DEFAULT_MINT_FEE_SATS,
      royaltyBps: 0,
      deskBps: 0
    }, LATER, ID)
    const stolen = await signRecordedDesk(attacker.wallet, mintPiece(attack, AFTER))
    const records = [stolen.edition!, stolen.mints[0]!, recorded.mints[0]!, recorded.edition!]
    const restored = deskFromRecords(records, ID)
    expect(restored?.edition?.title).toBe('Founding Volunteer 2026')
    expect(restored?.edition?.editionSize).toBe(2)
    expect(restored?.edition?.issuerKey).toBe(await org.identityPromise)
    expect(restored?.mints).toEqual([recorded.mints[0]])
    expect(bookFromRecords(records)[0]?.mints).toHaveLength(1)
    expect(mintedCount(records, ID)).toBe(1)
  })

  it('keeps only MAGIC keepsake on the public book', async () => {
    const desk = opened()
    const foreign = { magic: 'grant', keepsakeId: ID, kind: 'edition' as const }
    expect(keepMagic([desk.edition!, foreign])).toEqual([desk.edition])
    expect(parseKeepsakeFields([
      stringToUtf8Bytes('grant'),
      stringToUtf8Bytes('1'),
      stringToUtf8Bytes('edition'),
      stringToUtf8Bytes(ID)
    ])).toBeNull()
    expect(parseKeepsakeFields([
      stringToUtf8Bytes('keepsake'),
      stringToUtf8Bytes('1'),
      stringToUtf8Bytes('pack'),
      stringToUtf8Bytes(ID)
    ])).toBeNull()
    const recorded = await signRecordedDesk(walletOf().wallet, desk)
    const book = bookFromRecords([recorded.edition!])
    expect(book).toHaveLength(1)
    expect(book[0]?.edition.editionSize).toBe(2)
    expect(bookFromRecords([desk.edition!])).toEqual([])
    expect(bookFromRecords([])).toEqual([])
    expect(MAGIC).toBe('keepsake')
    expect(PROTOCOL_ID).toEqual([0, 'keepsake'])
  })

  it('sends to a holder, then a resale moves the piece and shows the split', () => {
    let desk = opened(500)
    desk = mintPiece(desk, NOW)
    expect(holderOf(desk, 1)).toBe(desk.edition?.issuerKey)
    desk = sendPiece(desk, 1, SAMPLE_RECIPIENT, LATER)
    expect(holderOf(desk, 1)).toBe(SAMPLE_RECIPIENT)
    expect(profileOf(desk, SAMPLE_RECIPIENT)[0]).toMatchObject({ serial: 1, shown: false })
    desk = showPiece(desk, 1, LATER)
    expect(profileOf(desk, SAMPLE_RECIPIENT)[0]?.shown).toBe(true)
    desk = resellPiece(desk, 1, SAMPLE_BUYER, 10_000, AFTER)
    expect(desk.rejection).toBeNull()
    expect(desk.resales[0]).toMatchObject({ royaltySats: 500, deskSats: 200, sellerSats: 9_300 })
    expect(holderOf(desk, 1)).toBe(SAMPLE_BUYER)
    const giftOnly = giftPiece(sendPiece(mintPiece(opened(1), NOW), 1, SAMPLE_RECIPIENT, LATER), 1, SAMPLE_BUYER, AFTER)
    expect(parseKeepsakeFields(encodeGiftFields(giftOnly.gifts[0]))).toEqual(giftOnly.gifts[0])
    expect(holderOf(giftOnly, 1)).toBe(SAMPLE_BUYER)
  })
})
