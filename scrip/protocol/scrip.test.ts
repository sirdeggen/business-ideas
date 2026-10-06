import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MINT_FEE_BPS,
  DEFAULT_REDEEM_FEE_BPS,
  MAGIC,
  PROTOCOL_ID,
  REDEEM_NEEDS_ATTEST,
  REDEEM_UNDER,
  attestReserve,
  attestationMatches,
  bookFromRecords,
  collateralOf,
  coverageBlock,
  deskFromRecords,
  encodeAttestFields,
  encodeIssueFields,
  encodeMintFields,
  encodeRedeemFields,
  feeSatsOf,
  issueBrand,
  keepMagic,
  liabilityOf,
  mintFeeLines,
  mintUnits,
  outstandingUnits,
  parseScripFields,
  redeemFeeLines,
  redeemUnits,
  stringToUtf8Bytes
} from './scrip'

const NOW = '2026-10-06T16:00:00Z'
const LATER = '2026-10-06T16:05:00Z'
const AFTER = '2026-10-06T16:10:00Z'
const ID = 'ab'.repeat(16)

function issued(setupFeeSats = 5_000) {
  return issueBrand({
    orgName: 'North Campus Union',
    brandName: 'Campus Cash',
    ticker: 'camp',
    unitLabel: 'Campus Cash',
    setupFeeSats,
    mintFeeBps: DEFAULT_MINT_FEE_BPS,
    redeemFeeBps: DEFAULT_REDEEM_FEE_BPS,
    satsPerUnit: 1
  }, NOW, ID)
}

describe('scrip protocol', () => {
  it('records the setup fee on the brand and does not treat it as liability', () => {
    const desk = issued(5_000)
    expect(desk.issue?.setupFeeSats).toBe(5_000)
    expect(desk.issue?.ticker).toBe('CAMP')
    expect(desk.issue?.mintFeeBps).toBe(50)
    expect(desk.issue?.redeemFeeBps).toBe(25)
    expect(outstandingUnits(desk)).toBe(0)
    expect(liabilityOf(desk)).toBe(0)
    expect(PROTOCOL_ID).toEqual([0, 'scrip'])
    expect(MAGIC).toBe('scrip')
  })

  it('floors mint and redeem fees in basis points', () => {
    expect(feeSatsOf(10_001, 50)).toBe(50)
    expect(feeSatsOf(1, 50)).toBe(0)
    expect(feeSatsOf(199, 50)).toBe(0)
    expect(feeSatsOf(200, 50)).toBe(1)
    expect(feeSatsOf(10_000, 25)).toBe(25)
    const mint = mintFeeLines(1_000, 1, 50)
    expect(mint).toMatchObject({ satsPaid: 1_000, feeSats: 5, netSats: 995, liabilitySats: 1_000 })
    const redeem = redeemFeeLines(10_000, 1, 25)
    expect(redeem).toMatchObject({ grossSats: 10_000, feeSats: 25, netSats: 9_975 })
    expect(redeemFeeLines(100, 1, 25).feeSats).toBe(0)
  })

  it('blocks redeem when the attestation is missing or the reserve is under the liability', () => {
    let desk = issued()
    desk = mintUnits(desk, 'Ada', 1_000, NOW)
    expect(liabilityOf(desk)).toBe(1_000)
    expect(coverageBlock(desk)).toBe(REDEEM_NEEDS_ATTEST)
    desk = redeemUnits(desk, 'Ada', 100, LATER)
    expect(desk.redeems).toHaveLength(0)
    expect(desk.rejection).toBe(REDEEM_NEEDS_ATTEST)

    desk = attestReserve(desk, 999, LATER)
    expect(collateralOf(desk).flag).toBe('under')
    desk = redeemUnits(desk, 'Ada', 100, LATER)
    expect(desk.rejection).toBe(REDEEM_UNDER)
    expect(desk.redeems).toHaveLength(0)
    expect(outstandingUnits(desk)).toBe(1_000)
  })

  it('updates the attestation and then allows a covered redeem', () => {
    let desk = issued()
    desk = mintUnits(desk, 'Ada', 1_000, NOW)
    desk = attestReserve(desk, 400, LATER)
    const first = desk.attestations[0]
    expect(collateralOf(desk).flag).toBe('under')

    desk = attestReserve(desk, 1_000, AFTER)
    expect(desk.attestations).toHaveLength(2)
    const latest = collateralOf(desk)
    expect(latest.flag).toBe('covered')
    expect(latest.attestation?.reserveSats).toBe(1_000)
    expect(latest.attestation?.attestation).not.toBe(first.attestation)
    expect(attestationMatches(latest.attestation!)).toBe(true)
    expect(latest.attestation?.attestedAt).toBe(AFTER)

    desk = redeemUnits(desk, 'Ada', 200, AFTER)
    expect(desk.rejection).toBeNull()
    expect(desk.redeems[0]?.netSats).toBe(200)
    expect(desk.redeems[0]?.feeSats).toBe(0)
    expect(outstandingUnits(desk)).toBe(800)
    expect(collateralOf(desk).flag).toBe('over')

    desk = mintUnits(desk, 'Bea', 500, AFTER)
    expect(liabilityOf(desk)).toBe(1_300)
    expect(collateralOf(desk).flag).toBe('under')
    expect(coverageBlock(desk)).toBe(REDEEM_UNDER)
  })

  it('round-trips issue, mint, attest, and redeem fields', () => {
    let desk = issued()
    desk = mintUnits(desk, 'Ada', 1_000, NOW)
    desk = attestReserve(desk, 1_000, LATER)
    desk = redeemUnits(desk, 'Ada', 100, AFTER)
    expect(parseScripFields(encodeIssueFields(desk.issue!))).toEqual(desk.issue)
    expect(parseScripFields(encodeMintFields(desk.mints[0]))).toEqual(desk.mints[0])
    expect(parseScripFields(encodeAttestFields(desk.attestations[0]))).toEqual(desk.attestations[0])
    expect(parseScripFields(encodeRedeemFields(desk.redeems[0]))).toEqual(desk.redeems[0])
    const restored = deskFromRecords([
      desk.issue!,
      desk.mints[0],
      desk.attestations[0],
      desk.redeems[0]
    ], ID)
    expect(restored?.issue?.brandName).toBe('Campus Cash')
    expect(outstandingUnits(restored!)).toBe(900)
  })

  it('keeps only MAGIC scrip on the public book', () => {
    const desk = issued()
    const foreign = { magic: 'closing', scripId: ID, kind: 'issue' as const }
    expect(keepMagic([desk.issue!, foreign])).toEqual([desk.issue])
    expect(parseScripFields([
      stringToUtf8Bytes('closing'),
      stringToUtf8Bytes('1'),
      stringToUtf8Bytes('issue'),
      stringToUtf8Bytes(ID)
    ])).toBeNull()
    const book = bookFromRecords([desk.issue!])
    expect(book).toHaveLength(1)
    expect(book[0]?.issue.ticker).toBe('CAMP')
    expect(bookFromRecords([])).toEqual([])
  })
})
