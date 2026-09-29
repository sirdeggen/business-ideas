import { describe, expect, it } from 'vitest'
import { sha256Hex } from '../../../protocol/sha256'
import {
  ATTEST_MATCH,
  DEFAULT_FEE_BPS,
  HASH_MATCH,
  MAGIC,
  PAYEE_BOUND,
  PAYEE_CHANGED,
  SWAP_REJECTED,
  TOPIC,
  approvePayeeChange,
  approveRelease,
  attachDeed,
  attemptPayeeSwap,
  attestDeed,
  attestationMatches,
  checkHash,
  deskFeeLines,
  encodeAttestFields,
  encodeDeedFields,
  encodeOpenFields,
  encodeReleaseFields,
  identityFor,
  openClosing,
  parseClosingFields,
  payeeChanged,
  releaseClosing,
  releaseReady
} from '../../../protocol/closing'

const NOW = '2026-09-01T12:00:00Z'
const ID = 'ab'.repeat(16)
const DEED = 'Assignment of mineral interest'

function opened(amendmentFeeSats = 0, amountSats = 1_000_000) {
  return openClosing({
    label: 'Mineral interest',
    amountSats,
    feeBps: DEFAULT_FEE_BPS,
    amendmentFeeSats,
    sellerName: 'Seller',
    includeAgent: true,
    agentName: 'Closing agent',
    buyerName: 'Buyer'
  }, NOW, ID)
}

describe('sha256', () => {
  it('matches the known hello vector', () => {
    expect(sha256Hex('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })
})

describe('bound payee and rejected swap', () => {
  it('binds the seller at open and rejects a unilateral swap', () => {
    const desk = opened()
    expect(desk.notice).toBe(PAYEE_BOUND)
    expect(desk.open?.payeeName).toBe('Seller')
    expect(desk.open?.payeeIdentity).toBe(identityFor('Seller'))
    expect(desk.open?.threshold).toBe(2)
    expect(payeeChanged(desk.open!)).toBe(false)

    const swapped = attemptPayeeSwap(desk, 'New wire desk', NOW)
    expect(swapped.rejection).toBe(SWAP_REJECTED)
    expect(swapped.open?.payeeName).toBe('Seller')
    expect(swapped.open?.payeeIdentity).toBe(desk.open?.payeeIdentity)
    expect(swapped.sawSwapRejection).toBe(true)

    const one = approvePayeeChange(swapped, 'buyer', NOW)
    expect(one.open?.payeeName).toBe('Seller')
    expect(one.payeeApprovals).toEqual(['buyer'])

    const two = approvePayeeChange(one, 'seller', NOW)
    expect(two.notice).toBe(PAYEE_CHANGED)
    expect(two.open?.payeeName).toBe('New wire desk')
    expect(two.open?.payeeIdentity).toBe(identityFor('New wire desk'))
    expect(two.open?.originalPayeeName).toBe('Seller')
    expect(payeeChanged(two.open!)).toBe(true)
  })

  it('charges the amendment fee only after the parties approve a change', () => {
    const desk = opened(500, 100_000)
    expect(deskFeeLines(desk)).toMatchObject({
      amountSats: 100_000,
      feeBps: 100,
      feeSats: 1_000,
      amendmentFeeSats: 0,
      netSats: 99_000
    })
    const changed = approvePayeeChange(approvePayeeChange(
      attemptPayeeSwap(desk, 'New wire desk', NOW),
      'buyer',
      NOW
    ), 'agent', NOW)
    expect(deskFeeLines(changed)).toMatchObject({
      amendmentFeeSats: 500,
      netSats: 98_500
    })
  })
})

describe('deed hash, attestation, and release', () => {
  it('walks attach, attest, rejected swap, quorum, and 100 bps release', () => {
    let desk = opened()
    const hash = sha256Hex(DEED)
    desk = attachDeed(desk, hash, 'Pasted deed', NOW)
    expect(desk.hashStatus).toBe('match')
    expect(desk.notice).toBe(HASH_MATCH)
    desk = checkHash(desk, sha256Hex('tampered'))
    expect(desk.hashStatus).toBe('mismatch')
    expect(releaseReady(desk)).toBeTruthy()
    desk = checkHash(desk, hash)
    expect(desk.hashStatus).toBe('match')
    desk = attestDeed(desk, NOW)
    expect(desk.attestation && attestationMatches(desk.attestation)).toBe(true)
    expect(ATTEST_MATCH).toBe('Attestation matches.')

    desk = attemptPayeeSwap(desk, 'New wire desk', NOW)
    expect(desk.rejection).toBe(SWAP_REJECTED)
    expect(desk.open?.payeeName).toBe('Seller')
    desk = approvePayeeChange(desk, 'buyer', NOW)
    desk = approvePayeeChange(desk, 'seller', NOW)
    expect(desk.open?.payeeName).toBe('New wire desk')

    expect(releaseClosing(desk, NOW).released).toBeNull()
    desk = approveRelease(desk, 'buyer')
    expect(releaseClosing(desk, NOW).released).toBeNull()
    desk = approveRelease(desk, 'closing agent' as 'buyer')
    desk = approveRelease(desk, 'agent')
    desk = releaseClosing(desk, NOW)
    expect(desk.released).toMatchObject({
      payeeName: 'New wire desk',
      amountSats: 1_000_000,
      feeBps: 100,
      feeSats: 10_000,
      amendmentFeeSats: 0,
      netSats: 990_000,
      docHash: hash,
      swapRejected: '1'
    })
    expect(desk.notice).toBe('Released.')
    expect(DEFAULT_FEE_BPS).toBe(100)
    expect(MAGIC).toBe('closing')
    expect(TOPIC).toBe('tm_anytx')
  })
})

describe('encode / decode', () => {
  it('round-trips open, deed, attest, and release', () => {
    let desk = opened()
    const hash = sha256Hex(DEED)
    desk = attachDeed(desk, hash, 'Pasted deed', NOW)
    desk = attestDeed(desk, NOW)
    desk = approveRelease(desk, 'buyer')
    desk = approveRelease(desk, 'seller')
    desk = releaseClosing(desk, NOW)
    expect(parseClosingFields(encodeOpenFields(desk.open!))).toEqual(desk.open)
    expect(parseClosingFields(encodeDeedFields(desk.deed!))).toEqual(desk.deed)
    expect(parseClosingFields(encodeAttestFields(desk.attestation!))).toEqual(desk.attestation)
    expect(parseClosingFields(encodeReleaseFields(desk.released!))).toEqual(desk.released)
  })
})
