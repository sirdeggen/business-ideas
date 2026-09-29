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
  deskFromRecords,
  encodeAttestFields,
  encodeDeedFields,
  encodeOpenFields,
  encodeReleaseFields,
  feeSatsOf,
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

function attested(desk = opened()) {
  return attestDeed(attachDeed(desk, sha256Hex(DEED), 'Pasted deed', NOW), NOW)
}

function openedWithoutAgent(amountSats = 1_000_000, feeBps = DEFAULT_FEE_BPS, amendmentFeeSats = 0) {
  return openClosing({
    label: 'Mineral interest',
    amountSats,
    feeBps,
    amendmentFeeSats,
    sellerName: 'Seller',
    includeAgent: false,
    buyerName: 'Buyer'
  }, NOW, ID)
}

describe('payee changes clear stale approvals', () => {
  it('drops release approvals when the bound payee changes, so release cannot go to the new payee', () => {
    let desk = attested()
    desk = approveRelease(desk, 'buyer')
    desk = approveRelease(desk, 'seller')
    expect(releaseReady(desk)).toBeNull()

    desk = attemptPayeeSwap(desk, 'Evil', NOW)
    desk = approvePayeeChange(desk, 'buyer', NOW)
    desk = approvePayeeChange(desk, 'seller', NOW)
    expect(desk.open?.payeeName).toBe('Evil')
    expect(desk.releaseApprovals).toEqual([])
    expect(releaseReady(desk)).not.toBeNull()
    expect(releaseClosing(desk, NOW).released).toBeNull()

    desk = approveRelease(desk, 'buyer')
    desk = approveRelease(desk, 'seller')
    expect(releaseClosing(desk, NOW).released?.payeeName).toBe('Evil')
  })

  it('binds payee approvals to the current proposal', () => {
    let desk = attemptPayeeSwap(opened(), 'Evil A', NOW)
    desk = approvePayeeChange(desk, 'buyer', NOW)
    expect(desk.open?.payeeName).toBe('Seller')
    expect(desk.payeeApprovals).toEqual(['buyer'])

    desk = attemptPayeeSwap(desk, 'Evil A', NOW)
    expect(desk.proposal?.name).toBe('Evil A')
    expect(desk.payeeApprovals).toEqual(['buyer'])

    desk = attemptPayeeSwap(desk, 'Evil B', NOW)
    expect(desk.proposal).toEqual({ name: 'Evil B', identity: identityFor('Evil B') })
    expect(desk.payeeApprovals).toEqual([])
    desk = approvePayeeChange(desk, 'seller', NOW)
    expect(desk.open?.payeeName).toBe('Seller')
    expect(desk.payeeApprovals).toEqual(['seller'])
  })

  it('clears release approvals when the deed is attached again', () => {
    let desk = attested()
    desk = approveRelease(desk, 'buyer')
    desk = approveRelease(desk, 'seller')
    expect(releaseReady(desk)).toBeNull()

    desk = attachDeed(desk, sha256Hex('A later assignment'), 'Later assignment', NOW)
    expect(desk.releaseApprovals).toEqual([])
    expect(desk.attestation).toBeNull()
    expect(releaseReady(desk)).not.toBeNull()
    expect(releaseClosing(desk, NOW).released).toBeNull()

    desk = attestDeed(desk, NOW)
    expect(desk.releaseApprovals).toEqual([])
    expect(releaseReady(desk)).not.toBeNull()
    expect(releaseClosing(desk, NOW).released).toBeNull()
  })
})

describe('approval edges, fee rounding, and a mismatched release payee', () => {
  it('counts a signer once', () => {
    const once = approveRelease(attested(), 'buyer')
    const twice = approveRelease(once, 'buyer')
    expect(twice.releaseApprovals).toEqual(['buyer'])
    expect(releaseReady(twice)).not.toBeNull()
    expect(releaseClosing(twice, NOW).released).toBeNull()
  })

  it('rejects someone who is not a party', () => {
    const desk = attested(openedWithoutAgent())
    const release = approveRelease(desk, 'agent')
    expect(release.releaseApprovals).toEqual([])
    expect(release.rejection).toMatch(/not a party/)
    const payee = approvePayeeChange(attemptPayeeSwap(desk, 'Evil', NOW), 'agent', NOW)
    expect(payee.payeeApprovals).toEqual([])
    expect(payee.open?.payeeName).toBe('Seller')
    expect(payee.rejection).toMatch(/not a party/)
  })

  it('floors the fee', () => {
    expect(feeSatsOf(10_001, 100)).toBe(100)
    expect(feeSatsOf(1, 100)).toBe(0)
    const lines = deskFeeLines(opened(0, 10_001))
    expect(lines).toMatchObject({ feeSats: 100, netSats: 9_901 })
  })

  it('refuses to open or release when the fee eats the net', () => {
    expect(() => openedWithoutAgent(100, 5000, 50)).toThrow(/nothing for the payee/)
    let desk = attested(openedWithoutAgent(100, 100, 0))
    desk = approveRelease(desk, 'buyer')
    desk = approveRelease(desk, 'seller')
    expect(releaseReady(desk)).toBeNull()
    desk = {
      ...desk,
      amendmentApplied: true,
      open: desk.open ? { ...desk.open, amendmentFeeSats: 99 } : null
    }
    const blocked = releaseClosing(desk, NOW)
    expect(blocked.released).toBeNull()
    expect(blocked.rejection).toMatch(/nothing for the payee/)
  })

  it('drops a release whose payee is not the bound payee', () => {
    let desk = attested(openedWithoutAgent())
    desk = approveRelease(desk, 'buyer')
    desk = approveRelease(desk, 'seller')
    desk = releaseClosing(desk, NOW)
    expect(desk.released?.payeeName).toBe('Seller')
    const kept = deskFromRecords([desk.open!, desk.deed!, desk.attestation!, desk.released!])
    expect(kept?.released?.payeeName).toBe('Seller')

    const evil = {
      ...desk.released!,
      payeeName: 'Evil',
      payeeIdentity: identityFor('Evil')
    }
    const dropped = deskFromRecords([desk.open!, desk.deed!, desk.attestation!, evil])
    expect(dropped?.open?.payeeName).toBe('Seller')
    expect(dropped?.released).toBeNull()
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
