import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import { sha256Hex } from './sha256'
import {
  CERT_FIELDS,
  CLOSED_REJECTION,
  DEFAULT_MAX_SATS,
  DEFAULT_MIN_SATS,
  DEFAULT_PRICE_SATS,
  ELIGIBILITY_REJECTION,
  KINDS,
  MAGIC,
  SCHEMA_VERSION,
  MISSING_FIELD_REJECTION,
  OPEN_REJECTION,
  OP_PUSH_TX,
  RESERVE_REJECTION,
  SAMPLE_BACKER,
  SAMPLE_CERTIFIER,
  SCRIPT_ENFORCES_ALLOCATION,
  SELECTIVE_REJECTION,
  SIGNING_COUNTERPARTY,
  SIGNING_KEY_ID,
  TOPIC,
  V1_NOTE,
  allocateRound,
  canonicalDisclosure,
  bookFromChain,
  closeRound,
  commitIdFor,
  commitToRound,
  derivedLockingKey,
  deskFromChain,
  disclose,
  eligibilityStampKey,
  encodeCloseFields,
  encodeCommitFields,
  encodeEligibilityFields,
  encodeLines,
  encodeTermsFields,
  escrowKeyId,
  escrowLockingKey,
  registerIdFor,
  handoffJson,
  openRound,
  parseRoundFields,
  paymentsBalance,
  registryHandoff,
  roundIdFor,
  settlementMatches,
  signRecordedDesk,
  type Allocation,
  type ChainRecord,
  type CloseRecord,
  type CommitRecord,
  type DeskState,
  type RecordSigner,
  type RoundTerms
} from './round'

const NOW = '2026-10-13T16:00:00.000Z'
const LATER = '2026-10-13T16:05:00.000Z'
const AFTER = '2026-10-13T16:10:00.000Z'
const DEADLINE = '2026-10-20T16:00:00.000Z'
const PAST = '2026-10-21T16:00:00.000Z'
const NONCE = 'ab'.repeat(16)
const COMMIT_NONCE = 'cd'.repeat(16)
const COMMIT_NONCE_2 = 'ef'.repeat(16)
const COMMIT_NONCE_3 = '12'.repeat(16)

function walletOf(key = PrivateKey.fromRandom()): { wallet: RecordSigner, identity: Promise<string> } {
  const wallet = new ProtoWallet(key)
  return {
    wallet,
    identity: wallet.getPublicKey({ identityKey: true }).then((result) => result.publicKey)
  }
}

function opened(patch: Partial<RoundTerms> = {}, issuerKey?: string): DeskState {
  return openRound({
    name: 'Harbor Co-op',
    orgKind: 'coop',
    pricing: 'fixed',
    unitLabel: 'units',
    priceSats: DEFAULT_PRICE_SATS,
    minSats: DEFAULT_MIN_SATS,
    maxSats: DEFAULT_MAX_SATS,
    deadline: DEADLINE,
    requiredFields: ['jurisdiction', 'member'],
    issuerKey,
    ...patch
  }, NOW, NONCE)
}

function withBacker(desk: DeskState, backerKey: string, sats: number, at: string, nonce: string, fields?: Record<string, string>, bidPriceSats?: number): DeskState {
  const disclosed = disclose(desk, {
    backerKey,
    certifierKey: SAMPLE_CERTIFIER,
    certificateType: 'membership',
    serialNumber: 'serial-1',
    fields: fields ?? { jurisdiction: 'CA', member: 'yes' }
  }, at)
  return commitToRound(disclosed, { backerKey, sats, bidPriceSats }, at, nonce)
}

describe('round ids and escrow lock', () => {
  it('binds the round id to sha256(issuerKey || nonce) and the commit id to the backer', () => {
    const issuer = SAMPLE_BACKER
    const roundId = roundIdFor(issuer, NONCE)
    expect(roundId).toBe(sha256Hex(`${issuer}${NONCE}`))
    expect(roundId).toHaveLength(64)
    expect(commitIdFor(SAMPLE_CERTIFIER, COMMIT_NONCE)).toBe(sha256Hex(`${SAMPLE_CERTIFIER}${COMMIT_NONCE}`))
    const desk = opened({}, issuer)
    expect(desk.terms?.roundId).toBe(roundId)
    expect(desk.terms?.roundId).not.toBe(roundIdFor(SAMPLE_CERTIFIER, NONCE))
  })

  it('derives one escrow key for counterparty anyone and a different key for self', async () => {
    const { identity } = walletOf()
    const issuer = await identity
    const roundId = roundIdFor(issuer, NONCE)
    const lock = escrowLockingKey(issuer, roundId)
    expect(lock).toBe(derivedLockingKey(issuer, escrowKeyId(roundId)))
    expect(lock).toMatch(/^(02|03)/)
    expect(escrowLockingKey(issuer, roundId)).toBe(lock)
    expect(SCRIPT_ENFORCES_ALLOCATION).toBe(false)
    expect(OP_PUSH_TX).toBe('OP_PUSH_TX')
    expect(V1_NOTE).toMatch(/v1 work/)
    expect(KINDS).toEqual(['terms', 'eligibility', 'commit', 'close'])
    expect(KINDS).not.toContain('transfer')
    expect(KINDS).not.toContain('resale')
    expect(TOPIC).toBe('tm_anytx')
  })
})

describe('selective disclosure', () => {
  it('keeps only the fields the raise asked for', () => {
    const disclosed = canonicalDisclosure('jurisdiction,member', { jurisdiction: 'CA', member: 'yes' })
    expect(disclosed).toBe('jurisdiction=CA;member=yes')
    expect(CERT_FIELDS).toContain('accredited')
    expect(() => canonicalDisclosure('jurisdiction,member', { jurisdiction: 'CA', member: 'yes', accredited: 'yes' })).toThrow(SELECTIVE_REJECTION)
    expect(() => canonicalDisclosure('jurisdiction,member', { jurisdiction: 'CA' })).toThrow(MISSING_FIELD_REJECTION)
    const desk = disclose(opened(), {
      backerKey: SAMPLE_BACKER,
      certifierKey: SAMPLE_CERTIFIER,
      certificateType: 'membership',
      serialNumber: 'serial-1',
      fields: { jurisdiction: 'CA', member: 'yes', residency: 'hidden' }
    }, LATER)
    expect(desk.eligibilities).toHaveLength(0)
    expect(desk.rejection).toBe(SELECTIVE_REJECTION)
  })

  it('refuses a commitment until eligibility matches', () => {
    const desk = commitToRound(opened(), { backerKey: SAMPLE_BACKER, sats: 5_000 }, LATER, COMMIT_NONCE)
    expect(desk.commits).toHaveLength(0)
    expect(desk.rejection).toBe(ELIGIBILITY_REJECTION)
  })
})

describe('allocation', () => {
  const ada = SAMPLE_BACKER
  const bea = identityFrom('bea')
  const cal = identityFrom('cal')

  it('refunds every backer when the deadline passes under the minimum', () => {
    let desk = withBacker(opened(), ada, 1_000, LATER, COMMIT_NONCE)
    desk = withBacker(desk, bea, 1_000, AFTER, COMMIT_NONCE_2)
    const early = closeRound(desk, AFTER)
    expect(early.close).toBeNull()
    expect(early.rejection).toBe(OPEN_REJECTION)
    const closed = closeRound(desk, PAST)
    expect(closed.close?.outcome).toBe('refund')
    expect(closed.close?.acceptedSats).toBe(0)
    const lines = allocateRound(closed.terms!, closed.commits, closed.eligibilities, PAST).lines
    expect(lines.map((line) => line.refundSats)).toEqual([1_000, 1_000])
    expect(lines.every((line) => line.units === 0)).toBe(true)
    expect(registryHandoff(closed.terms!, closed.close!)).toBeNull()
    expect(handoffJson(closed.terms!, closed.close!)).toContain('refund')
    expect(handoffJson(closed.terms!, closed.close!)).not.toContain('transfer')
    expect(paymentsBalance(closed.close!, closed.terms!.issuerKey)).toBe(true)
  })

  it('fills a fixed-price raise oldest first up to the maximum and refunds the rest', () => {
    let desk = openRound({
      name: 'Harbor Co-op',
      orgKind: 'coop',
      pricing: 'fixed',
      unitLabel: 'units',
      priceSats: 10_000,
      minSats: 50_000,
      maxSats: 80_000,
      deadline: DEADLINE,
      requiredFields: ['member'],
      issuerKey: SAMPLE_CERTIFIER
    }, NOW, NONCE)
    desk = withBacker(desk, ada, 40_000, LATER, COMMIT_NONCE, { member: 'yes' })
    desk = withBacker(desk, bea, 50_000, AFTER, COMMIT_NONCE_2, { member: 'yes' })
    desk = withBacker(desk, cal, 30_000, '2026-10-13T16:12:00.000Z', COMMIT_NONCE_3, { member: 'yes' })
    const closed = closeRound(desk, AFTER)
    expect(closed.close?.outcome).toBe('settled')
    expect(closed.close?.clearingPriceSats).toBe(10_000)
    expect(closed.close?.acceptedSats).toBe(80_000)
    const lines = allocateRound(closed.terms!, closed.commits, closed.eligibilities, AFTER).lines
    expect(lines.map((line) => [line.backerKey, line.units, line.acceptedSats, line.refundSats])).toEqual([
      [ada, 4, 40_000, 0],
      [bea, 4, 40_000, 10_000],
      [cal, 0, 0, 30_000]
    ])
    expect(settlementMatches(closed.close!, allocateRound(closed.terms!, closed.commits, closed.eligibilities, AFTER))).toBe(true)
    const again = allocateRound(closed.terms!, closed.commits, closed.eligibilities, AFTER)
    expect(again).toEqual(allocateRound(closed.terms!, closed.commits, closed.eligibilities, AFTER))
    const handoff = registryHandoff(closed.terms!, closed.close!)
    expect(handoff?.issues.map((issue) => [issue.holder, issue.units, issue.kind])).toEqual([
      [ada, 4, 'issue'],
      [bea, 4, 'issue']
    ])
    expect(handoff?.issues.every((issue) => issue.magic === 'registry')).toBe(true)
    expect(JSON.stringify(handoff)).not.toContain('transfer')
    expect(paymentsBalance(closed.close!, closed.terms!.issuerKey)).toBe(true)
    expect(closeRound(closed, PAST).rejection).toBe(CLOSED_REJECTION)
  })

  it('sets a clearing price at the lowest accepted bid and refunds bids under the reserve', () => {
    let desk = openRound({
      name: 'North Workshop',
      orgKind: 'startup',
      pricing: 'clearing',
      unitLabel: 'units',
      priceSats: 10_000,
      minSats: 30_000,
      maxSats: 100_000,
      deadline: DEADLINE,
      requiredFields: ['jurisdiction'],
      issuerKey: SAMPLE_CERTIFIER
    }, NOW, NONCE)
    desk = withBacker(desk, ada, 60_000, LATER, COMMIT_NONCE, { jurisdiction: 'CA' }, 30_000)
    desk = withBacker(desk, bea, 50_000, AFTER, COMMIT_NONCE_2, { jurisdiction: 'CA' }, 20_000)
    const eligible = disclose(desk, {
      backerKey: cal,
      certifierKey: SAMPLE_CERTIFIER,
      certificateType: 'membership',
      serialNumber: 'serial-1',
      fields: { jurisdiction: 'CA' }
    }, AFTER)
    const under = commitToRound(eligible, { backerKey: cal, sats: 40_000, bidPriceSats: 8_000 }, AFTER, COMMIT_NONCE_3)
    expect(under.rejection).toBe(RESERVE_REJECTION)
    const closed = closeRound(desk, LATER)
    expect(closed.close?.outcome).toBe('settled')
    expect(closed.close?.clearingPriceSats).toBe(20_000)
    expect(closed.close?.qualifiedSats).toBe(110_000)
    expect(closed.close?.acceptedSats).toBe(100_000)
    const lines = allocateRound(closed.terms!, closed.commits, closed.eligibilities, LATER).lines
    expect(lines.find((line) => line.backerKey === ada)).toMatchObject({ units: 3, acceptedSats: 60_000, refundSats: 0 })
    expect(lines.find((line) => line.backerKey === bea)).toMatchObject({ units: 2, acceptedSats: 40_000, refundSats: 10_000 })
  })
})

describe('signed records', () => {
  it('signs every record with createSignature counterparty anyone and drops a bad signature or a mismatched escrow key', async () => {
    const { wallet, identity } = walletOf()
    const issuer = (await identity).toLowerCase()
    let desk = opened({}, issuer)
    desk = withBacker(desk, SAMPLE_BACKER, 5_000, LATER, COMMIT_NONCE)
    desk = closeRound(desk, LATER)
    expect(desk.close?.outcome).toBe('settled')
    const signed = await signRecordedDesk(wallet, desk)
    expect(signed.terms?.issuerKey).toBe(issuer)
    expect(signed.terms?.roundId).toBe(roundIdFor(issuer, NONCE))
    expect(signed.terms?.signature.length).toBeGreaterThan(16)
    expect(signed.eligibilities[0]?.signature.length).toBeGreaterThan(16)
    expect(signed.commits[0]?.signature.length).toBeGreaterThan(16)
    expect(signed.close?.signature.length).toBeGreaterThan(16)
    expect(SIGNING_KEY_ID).toBe('round')
    expect(SIGNING_COUNTERPARTY).toBe('anyone')

    const terms = parseRoundFields(encodeTermsFields(signed.terms!))
    const eligibility = parseRoundFields(encodeEligibilityFields(signed.eligibilities[0]!))
    const commit = parseRoundFields(encodeCommitFields(signed.commits[0]!))
    const close = parseRoundFields(encodeCloseFields(signed.close!))
    expect(terms).toEqual(signed.terms)
    expect(eligibility).toEqual(signed.eligibilities[0])
    expect(commit).toEqual(signed.commits[0])
    expect(close).toEqual(signed.close)

    const roundId = signed.terms!.roundId
    const lock = escrowLockingKey(issuer, roundId)
    const txid = 'aa'.repeat(32)
    const rows: ChainRecord[] = [
      { txid, vout: 0, lockingPublicKey: lock, payload: signed.terms!, txAt: NOW },
      { txid, vout: 1, lockingPublicKey: lock, payload: signed.eligibilities[0]!, txAt: LATER },
      { txid, vout: 2, lockingPublicKey: lock, payload: signed.commits[0]!, txAt: LATER },
      { txid, vout: 3, lockingPublicKey: lock, payload: signed.close!, txAt: LATER }
    ]
    const read = deskFromChain(rows)
    expect(read?.terms?.name).toBe('Harbor Co-op')
    expect(read?.close?.outcome).toBe('settled')
    expect(read?.commits[0]?.sats).toBe(5_000)

    const tampered = { ...signed.terms!, signature: 'ab'.repeat(40) }
    expect(deskFromChain([{ txid, vout: 0, lockingPublicKey: lock, payload: tampered }])).toBeNull()
    const wrongLock = '02' + '11'.repeat(32)
    expect(deskFromChain([{ ...rows[0], lockingPublicKey: wrongLock }])).toBeNull()

    const foreign = { ...signed.terms!, magic: 'bounty' as typeof MAGIC }
    expect(parseRoundFields(encodeTermsFields(signed.terms!).map((field, index) => index === 0 ? stringBytes('nope') : field))).toBeNull()
    expect(foreign.magic).not.toBe(MAGIC)
  })

  it('does not count a commit stated before the deadline when its transaction is after the deadline', async () => {
    const { wallet, identity } = walletOf()
    const issuer = (await identity).toLowerCase()
    let desk = opened({ priceSats: 1_000, minSats: 3_000, maxSats: 10_000 }, issuer)
    desk = withBacker(desk, SAMPLE_BACKER, 5_000, LATER, COMMIT_NONCE)
    const trusted = closeRound(desk, PAST)
    expect(trusted.close?.outcome).toBe('settled')
    expect(trusted.close?.acceptedSats).toBe(5_000)

    const commitStamps = new Map([[desk.commits[0]!.commitId, { txAt: PAST }]])
    const eligibilityStamps = new Map([[eligibilityStampKey(desk.eligibilities[0]!), { txAt: LATER }]])
    const late = allocateRound(desk.terms!, desk.commits, desk.eligibilities, LATER, {
      fromChain: true,
      commitStamps,
      eligibilityStamps,
      closeStamp: { txAt: PAST }
    })
    expect(late.outcome).toBe('refund')
    expect(late.acceptedSats).toBe(0)
    expect(late.lines[0]).toMatchObject({ qualified: false, units: 0, refundSats: 5_000 })

    const honest = await signRecordedDesk(wallet, { ...desk, close: closeFor(desk.terms!, late, LATER), rejection: null })
    const lock = escrowLockingKey(issuer, honest.terms!.roundId)
    const txid = 'bb'.repeat(32)
    const read = deskFromChain([
      { txid, vout: 0, lockingPublicKey: lock, payload: honest.terms!, txAt: NOW },
      { txid, vout: 1, lockingPublicKey: lock, payload: honest.eligibilities[0]!, txAt: LATER },
      { txid, vout: 2, lockingPublicKey: lock, payload: honest.commits[0]!, txAt: PAST },
      { txid, vout: 3, lockingPublicKey: lock, payload: honest.close!, txAt: PAST }
    ])
    expect(read?.close?.outcome).toBe('refund')
    expect(read?.close?.acceptedSats).toBe(0)
    expect(read?.commits[0]?.committedAt).toBe(LATER)
    expect(Date.parse(read!.commits[0]!.committedAt)).toBeLessThan(Date.parse(DEADLINE))
    expect(Date.parse(PAST)).toBeGreaterThan(Date.parse(DEADLINE))

    const settledLie = await signRecordedDesk(wallet, trusted)
    const lied = deskFromChain([
      { txid, vout: 0, lockingPublicKey: lock, payload: settledLie.terms!, txAt: NOW },
      { txid, vout: 1, lockingPublicKey: lock, payload: settledLie.eligibilities[0]!, txAt: LATER },
      { txid, vout: 2, lockingPublicKey: lock, payload: settledLie.commits[0]!, txAt: PAST },
      { txid, vout: 3, lockingPublicKey: lock, payload: settledLie.close!, txAt: PAST }
    ])
    expect(lied?.close).toBeNull()
  })

  it('fills by transaction time when a commit backdates its stated time', () => {
    const ada = SAMPLE_BACKER
    const bea = identityFrom('bea')
    let desk = openRound({
      name: 'Harbor Co-op',
      orgKind: 'coop',
      pricing: 'fixed',
      unitLabel: 'units',
      priceSats: 10_000,
      minSats: 40_000,
      maxSats: 40_000,
      deadline: DEADLINE,
      requiredFields: ['member'],
      issuerKey: SAMPLE_CERTIFIER
    }, NOW, NONCE)
    desk = withBacker(desk, ada, 40_000, LATER, COMMIT_NONCE, { member: 'yes' })
    desk = withBacker(desk, bea, 40_000, AFTER, COMMIT_NONCE_2, { member: 'yes' })
    const commitStamps = new Map([
      [desk.commits.find((row) => row.backerKey === ada)!.commitId, { txAt: AFTER }],
      [desk.commits.find((row) => row.backerKey === bea)!.commitId, { txAt: LATER }]
    ])
    const eligibilityStamps = new Map(desk.eligibilities.map((row) => [eligibilityStampKey(row), { txAt: NOW }]))
    const lines = allocateRound(desk.terms!, desk.commits, desk.eligibilities, AFTER, {
      fromChain: true,
      commitStamps,
      eligibilityStamps,
      closeStamp: { txAt: AFTER }
    }).lines
    expect(lines.find((line) => line.backerKey === bea)).toMatchObject({ units: 4, acceptedSats: 40_000, refundSats: 0 })
    expect(lines.find((line) => line.backerKey === ada)).toMatchObject({ units: 0, acceptedSats: 0, refundSats: 40_000 })
  })

  it('does not refund under the minimum when the close transaction is still before the deadline', async () => {
    const { wallet, identity } = walletOf()
    const issuer = (await identity).toLowerCase()
    let desk = opened({ priceSats: 1_000, minSats: 20_000, maxSats: 40_000 }, issuer)
    desk = withBacker(desk, SAMPLE_BACKER, 5_000, LATER, COMMIT_NONCE)
    const early = closeRound(desk, LATER)
    expect(early.rejection).toBe(OPEN_REJECTION)
    const claimed = closeRound({ ...desk, close: null, rejection: null }, PAST)
    expect(claimed.close?.outcome).toBe('refund')
    const signed = await signRecordedDesk(wallet, claimed)
    const lock = escrowLockingKey(issuer, signed.terms!.roundId)
    const txid = 'cc'.repeat(32)
    const read = deskFromChain([
      { txid, vout: 0, lockingPublicKey: lock, payload: signed.terms!, txAt: NOW },
      { txid, vout: 1, lockingPublicKey: lock, payload: signed.eligibilities[0]!, txAt: LATER },
      { txid, vout: 2, lockingPublicKey: lock, payload: signed.commits[0]!, txAt: LATER },
      { txid, vout: 3, lockingPublicKey: lock, payload: signed.close!, txAt: LATER }
    ])
    expect(read?.close).toBeNull()
    const lateLock = Math.floor(Date.parse(PAST) / 1000)
    const byLock = allocateRound(desk.terms!, desk.commits, desk.eligibilities, LATER, {
      fromChain: true,
      commitStamps: new Map([[desk.commits[0]!.commitId, { lockTime: lateLock }]]),
      eligibilityStamps: new Map([[eligibilityStampKey(desk.eligibilities[0]!), { txAt: LATER }]]),
      closeStamp: { lockTime: lateLock }
    })
    expect(byLock.outcome).toBe('pending')
    expect(byLock.lines[0]?.qualified).toBe(false)
    const earlyLock = Math.floor(Date.parse(LATER) / 1000)
    const unproven = allocateRound(desk.terms!, desk.commits, desk.eligibilities, PAST, {
      fromChain: true,
      commitStamps: new Map([[desk.commits[0]!.commitId, { lockTime: earlyLock }]]),
      eligibilityStamps: new Map([[eligibilityStampKey(desk.eligibilities[0]!), { txAt: LATER }]]),
      closeStamp: { lockTime: earlyLock }
    })
    expect(unproven.outcome).toBe('pending')
    expect(unproven.lines[0]?.qualified).toBe(false)
  })

  it('stays pending when the overlay host sent no time, instead of reading a refund', async () => {
    const { wallet, identity } = walletOf()
    const issuer = (await identity).toLowerCase()
    let desk = opened({ priceSats: 1_000, minSats: 3_000, maxSats: 10_000 }, issuer)
    desk = withBacker(desk, SAMPLE_BACKER, 5_000, LATER, COMMIT_NONCE)
    const trusted = closeRound(desk, PAST)
    expect(trusted.close?.outcome).toBe('settled')
    const signed = await signRecordedDesk(wallet, trusted)
    const lock = escrowLockingKey(issuer, signed.terms!.roundId)
    const txid = 'dd'.repeat(32)
    const rows = [
      { txid, vout: 0, lockingPublicKey: lock, payload: signed.terms! },
      { txid, vout: 1, lockingPublicKey: lock, payload: signed.eligibilities[0]! },
      { txid, vout: 2, lockingPublicKey: lock, payload: signed.commits[0]! },
      { txid, vout: 3, lockingPublicKey: lock, payload: signed.close! }
    ]
    expect(deskFromChain(rows)?.close).toBeNull()
    expect(bookFromChain(rows)[0]?.outcome).toBe('pending')
    const noContext = allocateRound(signed.terms!, signed.commits, signed.eligibilities, PAST, {
      fromChain: true,
      commitStamps: new Map([[signed.commits[0]!.commitId, {}]]),
      eligibilityStamps: new Map([[eligibilityStampKey(signed.eligibilities[0]!), {}]]),
      closeStamp: {}
    })
    expect(noContext.outcome).toBe('pending')
    expect(noContext.outcome).not.toBe('refund')
  })

  it('breaks a terms tie by txid instead of nLockTime', async () => {
    const { wallet, identity } = walletOf()
    const issuer = (await identity).toLowerCase()
    const input = {
      orgKind: 'coop' as const,
      pricing: 'fixed' as const,
      unitLabel: 'units',
      priceSats: 1_000,
      minSats: 3_000,
      maxSats: 10_000,
      deadline: DEADLINE,
      requiredFields: ['member'],
      issuerKey: issuer
    }
    const early = await signRecordedDesk(wallet, openRound({ ...input, name: 'Early Lock' }, NOW, NONCE))
    const late = await signRecordedDesk(wallet, openRound({ ...input, name: 'Late Lock' }, NOW, '34'.repeat(16)))
    const earlyLock = Math.floor(Date.parse(LATER) / 1000)
    const lateLock = Math.floor(Date.parse(AFTER) / 1000)
    const lowTx = '11'.repeat(32)
    const highTx = 'ff'.repeat(32)
    const earlyKey = escrowLockingKey(issuer, early.terms!.roundId)
    const lateKey = escrowLockingKey(issuer, late.terms!.roundId)
    const byLock = deskFromChain([
      { txid: highTx, vout: 0, lockingPublicKey: earlyKey, payload: early.terms!, lockTime: earlyLock },
      { txid: lowTx, vout: 0, lockingPublicKey: lateKey, payload: late.terms!, lockTime: lateLock }
    ])
    expect(byLock?.terms?.name).toBe('Late Lock')
    const sameHostTime = deskFromChain([
      { txid: highTx, vout: 0, lockingPublicKey: earlyKey, payload: early.terms!, txAt: NOW, lockTime: earlyLock },
      { txid: lowTx, vout: 0, lockingPublicKey: lateKey, payload: late.terms!, txAt: NOW, lockTime: lateLock }
    ])
    expect(sameHostTime?.terms?.name).toBe('Late Lock')
    const timedBeforeUntimed = deskFromChain([
      { txid: lowTx, vout: 0, lockingPublicKey: lateKey, payload: late.terms! },
      { txid: highTx, vout: 0, lockingPublicKey: earlyKey, payload: early.terms!, txAt: NOW }
    ])
    expect(timedBeforeUntimed?.terms?.name).toBe('Early Lock')
  })

  it('orders commits by txid when the host time ties, not by nLockTime', async () => {
    const { wallet, identity } = walletOf()
    const issuer = (await identity).toLowerCase()
    const ada = SAMPLE_BACKER
    const bea = identityFrom('bea')
    let desk = opened({ priceSats: 1_000, minSats: 3_000, maxSats: 20_000 }, issuer)
    desk = withBacker(desk, ada, 5_000, LATER, COMMIT_NONCE)
    desk = withBacker(desk, bea, 5_000, AFTER, COMMIT_NONCE_2)
    const signed = await signRecordedDesk(wallet, desk)
    const lock = escrowLockingKey(issuer, signed.terms!.roundId)
    const adaCommit = signed.commits.find((row) => row.backerKey.toLowerCase() === ada.toLowerCase())!
    const beaCommit = signed.commits.find((row) => row.backerKey.toLowerCase() === bea.toLowerCase())!
    const earlyLock = Math.floor(Date.parse(LATER) / 1000)
    const lateLock = Math.floor(Date.parse(AFTER) / 1000)
    const read = deskFromChain([
      { txid: 'ab'.repeat(32), vout: 0, lockingPublicKey: lock, payload: signed.terms!, txAt: NOW },
      { txid: 'ff'.repeat(32), vout: 1, lockingPublicKey: lock, payload: adaCommit, txAt: LATER, lockTime: earlyLock },
      { txid: '11'.repeat(32), vout: 2, lockingPublicKey: lock, payload: beaCommit, txAt: LATER, lockTime: lateLock }
    ])
    expect(read?.commits.map((row) => row.backerKey.toLowerCase())).toEqual([bea.toLowerCase(), ada.toLowerCase()])
    const noHostTime = deskFromChain([
      { txid: 'ab'.repeat(32), vout: 0, lockingPublicKey: lock, payload: signed.terms!, txAt: NOW },
      { txid: 'ff'.repeat(32), vout: 1, lockingPublicKey: lock, payload: adaCommit, lockTime: earlyLock },
      { txid: '11'.repeat(32), vout: 2, lockingPublicKey: lock, payload: beaCommit, lockTime: lateLock }
    ])
    expect(noHostTime?.commits.map((row) => row.backerKey.toLowerCase())).toEqual([bea.toLowerCase(), ada.toLowerCase()])
  })

  it('stays pending when eligibility is unproven instead of dropping it', async () => {
    const { wallet, identity } = walletOf()
    const issuer = (await identity).toLowerCase()
    let desk = opened({ priceSats: 1_000, minSats: 3_000, maxSats: 10_000 }, issuer)
    desk = withBacker(desk, SAMPLE_BACKER, 5_000, LATER, COMMIT_NONCE)
    const trusted = closeRound(desk, PAST)
    expect(trusted.close?.outcome).toBe('settled')
    const signed = await signRecordedDesk(wallet, trusted)
    const lock = escrowLockingKey(issuer, signed.terms!.roundId)
    const txid = 'ee'.repeat(32)
    const earlyLock = Math.floor(Date.parse(LATER) / 1000)
    const rows: ChainRecord[] = [
      { txid, vout: 0, lockingPublicKey: lock, payload: signed.terms!, txAt: NOW },
      { txid, vout: 1, lockingPublicKey: lock, payload: signed.eligibilities[0]!, lockTime: earlyLock },
      { txid, vout: 2, lockingPublicKey: lock, payload: signed.commits[0]!, txAt: LATER },
      { txid, vout: 3, lockingPublicKey: lock, payload: signed.close!, txAt: PAST }
    ]
    const read = deskFromChain(rows)
    expect(read?.eligibilities).toHaveLength(1)
    expect(read?.close).toBeNull()
    expect(bookFromChain(rows)[0]?.outcome).toBe('pending')
    const allocation = allocateRound(signed.terms!, signed.commits, signed.eligibilities, PAST, {
      fromChain: true,
      commitStamps: new Map([[signed.commits[0]!.commitId, { txAt: LATER }]]),
      eligibilityStamps: new Map([[eligibilityStampKey(signed.eligibilities[0]!), { lockTime: earlyLock }]]),
      closeStamp: { txAt: PAST }
    })
    expect(allocation.outcome).toBe('pending')
    expect(allocation.outcome).not.toBe('refund')
  })

  it('stays pending when the close lockTime is past the deadline and the host sent no time', async () => {
    const { wallet, identity } = walletOf()
    const issuer = (await identity).toLowerCase()
    let desk = opened({ priceSats: 1_000, minSats: 20_000, maxSats: 40_000 }, issuer)
    desk = withBacker(desk, SAMPLE_BACKER, 5_000, LATER, COMMIT_NONCE)
    const claimed = closeRound(desk, PAST)
    expect(claimed.close?.outcome).toBe('refund')
    const signed = await signRecordedDesk(wallet, claimed)
    const lock = escrowLockingKey(issuer, signed.terms!.roundId)
    const txid = 'e1'.repeat(32)
    const lateLock = Math.floor(Date.parse(PAST) / 1000)
    expect(lateLock).toBeGreaterThanOrEqual(Math.floor(Date.parse(DEADLINE) / 1000))
    const rows: ChainRecord[] = [
      { txid, vout: 0, lockingPublicKey: lock, payload: signed.terms!, txAt: NOW },
      { txid, vout: 1, lockingPublicKey: lock, payload: signed.eligibilities[0]!, txAt: LATER },
      { txid, vout: 2, lockingPublicKey: lock, payload: signed.commits[0]!, txAt: LATER },
      { txid, vout: 3, lockingPublicKey: lock, payload: signed.close!, lockTime: lateLock }
    ]
    expect(deskFromChain(rows)?.close).toBeNull()
    expect(bookFromChain(rows)[0]?.outcome).toBe('pending')
    const allocation = allocateRound(signed.terms!, signed.commits, signed.eligibilities, PAST, {
      fromChain: true,
      commitStamps: new Map([[signed.commits[0]!.commitId, { txAt: LATER }]]),
      eligibilityStamps: new Map([[eligibilityStampKey(signed.eligibilities[0]!), { txAt: LATER }]]),
      closeStamp: { lockTime: lateLock }
    })
    expect(allocation.outcome).toBe('pending')
    expect(allocation.outcome).not.toBe('refund')
    expect(allocation.outcome).not.toBe('settled')
  })
})

function closeFor(terms: RoundTerms, allocation: Allocation, at: string): CloseRecord {
  if (allocation.outcome === 'open') throw new Error('open')
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'close',
    roundId: terms.roundId,
    outcome: allocation.outcome,
    qualifiedSats: allocation.qualifiedSats,
    acceptedSats: allocation.acceptedSats,
    clearingPriceSats: allocation.clearingPriceSats,
    registerId: registerIdFor(terms.roundId),
    lines: encodeLines(allocation.lines),
    closedAt: at,
    signature: ''
  }
}

function identityFrom(label: string): string {
  return `02${sha256Hex(`round-desk\n${label}`)}`
}

function stringBytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}
