import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AMOUNT_SATS,
  DEFAULT_DURATION_DAYS,
  TAG,
  UNFUNDED_STREAM_MESSAGE,
  accrue,
  encodeStreamFields,
  joinStreamRecords,
  parseStreamFields,
  planClaim,
  planOpen,
  rateSatsPerSec,
  satsToUsd,
  type StreamPayload
} from './stream'

const TREASURER = '025706528f0f6894b2ba505007267ccff1133e004452a1f6b72ac716f246216366'
const CONTRACTOR = `03${'11'.repeat(32)}`

function demoStream(partial: Partial<StreamPayload> = {}): StreamPayload {
  const amountSats = partial.amountSats ?? 1_400_000
  const durationSec = partial.durationSec ?? 14 * 86_400
  return {
    tag: TAG,
    streamId: partial.streamId ?? 'ab'.repeat(16),
    org: partial.org ?? 'Harbor Legal Aid',
    contractorName: partial.contractorName ?? 'Jordan Lee',
    contractorIdentity: partial.contractorIdentity ?? CONTRACTOR,
    treasurerIdentity: partial.treasurerIdentity ?? TREASURER,
    amountSats,
    rateSatsPerSec: partial.rateSatsPerSec ?? rateSatsPerSec(amountSats, durationSec),
    startIso: partial.startIso ?? '2026-08-11T12:00:00.000Z',
    durationSec,
    frozen: partial.frozen ?? false,
    claimedSats: partial.claimedSats ?? 0,
    freezeIso: partial.freezeIso ?? '',
    amountUsd: partial.amountUsd ?? '400.00',
    memo: partial.memo ?? 'Legal research week',
    updatedIso: partial.updatedIso ?? '2026-08-11T12:00:00.000Z',
    lastClaimSats: partial.lastClaimSats ?? 0,
    lastClaimIso: partial.lastClaimIso ?? ''
  }
}

describe('accrual math', () => {
  const stream = demoStream()
  const start = Date.parse(stream.startIso)

  it('earns nothing before start', () => {
    const math = accrue(stream, start - 1_000)
    expect(math.earnedSats).toBe(0)
    expect(math.claimableSats).toBe(0)
    expect(math.status).toBe('open')
  })

  it('earns day-3 of a 14-day stream as 3/14 of the sats', () => {
    const day3 = start + 3 * 86_400_000
    const math = accrue(stream, day3)
    expect(math.earnedSats).toBe(Math.floor(stream.rateSatsPerSec * 3 * 86_400))
    expect(math.earnedSats).toBe(Math.floor(stream.amountSats * 3 / 14))
    expect(math.claimableSats).toBe(math.earnedSats)
    expect(math.status).toBe('open')
  })

  it('subtracts already-claimed sats from claimable', () => {
    const day3 = start + 3 * 86_400_000
    const earned = Math.floor(stream.amountSats * 3 / 14)
    const math = accrue({ ...stream, claimedSats: 50_000 }, day3)
    expect(math.earnedSats).toBe(earned)
    expect(math.claimableSats).toBe(earned - 50_000)
  })

  it('stops the clock at freezeIso and still leaves already-claimable claimable', () => {
    const freezeAt = start + 2 * 86_400_000
    const later = start + 10 * 86_400_000
    const frozen = {
      ...stream,
      frozen: true,
      freezeIso: new Date(freezeAt).toISOString(),
      claimedSats: 0
    }
    const math = accrue(frozen, later)
    expect(math.earnedSats).toBe(Math.floor(stream.amountSats * 2 / 14))
    expect(math.claimableSats).toBe(math.earnedSats)
    expect(math.status).toBe('frozen')
  })

  it('caps at the full amount when the duration ends', () => {
    const after = start + 20 * 86_400_000
    const math = accrue(stream, after)
    expect(math.earnedSats).toBe(stream.amountSats)
    expect(math.claimableSats).toBe(stream.amountSats)
    expect(math.status).toBe('finished')
  })

  it('never goes negative when claimed exceeds earned', () => {
    const math = accrue({ ...stream, claimedSats: stream.amountSats }, start + 1_000)
    expect(math.claimableSats).toBe(0)
  })
})

describe('stream fields', () => {
  it('round-trips PushDrop fields tagged streampay', () => {
    const fields = encodeStreamFields(demoStream())
    expect(parseStreamFields(fields)).toEqual(demoStream())
  })

  it('rejects a different tag so invoices and treasury rows drop out', () => {
    const fields = encodeStreamFields(demoStream())
    fields[0] = Array.from(new TextEncoder().encode('bsvinvoice'))
    expect(parseStreamFields(fields)).toBeNull()
  })

  it('round-trips an empty contractor identity', () => {
    const stream = demoStream({ contractorIdentity: '' })
    const fields = encodeStreamFields(stream)
    expect(fields[4]).toEqual([])
    expect(parseStreamFields(fields)).toEqual(stream)
  })

  it('treats PushDrop OP_0 contractor [0] as blank', () => {
    const stream = demoStream({ contractorIdentity: '' })
    const fields = encodeStreamFields(stream)
    fields[4] = [0]
    expect(parseStreamFields(fields)).toEqual(stream)
  })

  it('joins snapshots by streamId: max claimed, sticky freeze', () => {
    const id = 'cd'.repeat(16)
    const open = demoStream({ streamId: id, claimedSats: 0, updatedIso: '2026-08-11T12:00:00.000Z' })
    const claimed = demoStream({
      streamId: id,
      claimedSats: 100,
      lastClaimSats: 100,
      lastClaimIso: '2026-08-14T12:00:00.000Z',
      updatedIso: '2026-08-14T12:00:00.000Z'
    })
    const frozen = demoStream({
      streamId: id,
      claimedSats: 100,
      frozen: true,
      freezeIso: '2026-08-15T12:00:00.000Z',
      updatedIso: '2026-08-15T12:00:00.000Z'
    })
    const [row] = joinStreamRecords([
      { stream: open, txid: 'aa'.repeat(32), outputIndex: 0 },
      { stream: claimed, txid: 'bb'.repeat(32), outputIndex: 0 },
      { stream: frozen, txid: 'cc'.repeat(32), outputIndex: 0 }
    ])
    expect(row.claimedSats).toBe(100)
    expect(row.frozen).toBe(true)
    expect(row.freezeIso).toBe('2026-08-15T12:00:00.000Z')
    expect(row.lastClaimSats).toBe(100)
    expect(row.txid).toBe('cc'.repeat(32))
    expect(row.satoshis).toBe(1)
  })

  it('keeps the funded pot outpoint when a later freeze is 1 sat', () => {
    const id = 'ef'.repeat(16)
    const open = demoStream({ streamId: id, claimedSats: 0, updatedIso: '2026-08-11T12:00:00.000Z' })
    const frozen = demoStream({
      streamId: id,
      frozen: true,
      freezeIso: '2026-08-15T12:00:00.000Z',
      updatedIso: '2026-08-15T12:00:00.000Z'
    })
    const [row] = joinStreamRecords([
      { stream: open, txid: 'aa'.repeat(32), outputIndex: 0, satoshis: open.amountSats },
      { stream: frozen, txid: 'cc'.repeat(32), outputIndex: 0, satoshis: 1 }
    ])
    expect(row.frozen).toBe(true)
    expect(row.txid).toBe('aa'.repeat(32))
    expect(row.satoshis).toBe(open.amountSats)
  })
})

describe('open and claim plans', () => {
  it('defaults Open to 100,000 sats over 14 days', () => {
    expect(DEFAULT_AMOUNT_SATS).toBe(100_000)
    expect(DEFAULT_DURATION_DAYS).toBe(14)
    expect(planOpen(DEFAULT_AMOUNT_SATS)).toEqual({ potSats: 100_000 })
  })

  it('opens by locking the sat pot the treasurer funds, not 1 sat and not a $400 spot conversion', () => {
    expect(planOpen(DEFAULT_AMOUNT_SATS)).toEqual({ potSats: DEFAULT_AMOUNT_SATS })
    expect(planOpen(DEFAULT_AMOUNT_SATS).potSats).not.toBe(1)
    expect(planOpen(DEFAULT_AMOUNT_SATS).potSats).toBeLessThan(1_000_000)
  })

  it('claims claimable sats when that is less than amountSats', () => {
    const amountSats = DEFAULT_AMOUNT_SATS
    const claimableSats = 21_428
    const plan = planClaim({
      fundedSats: amountSats,
      amountSats,
      claimableSats
    })
    expect(plan.claimSats).toBe(claimableSats)
    expect(plan.claimSats).not.toBe(amountSats)
    expect(plan.remainingSats).toBe(amountSats - claimableSats)
    expect(plan.outputSatoshis).toEqual([claimableSats, amountSats - claimableSats])
    expect(plan.outputSatoshis[0]).toBe(claimableSats)
  })

  it('still pays claimable when earned is capped at amountSats (claimed=0)', () => {
    const amountSats = DEFAULT_AMOUNT_SATS
    const plan = planClaim({
      fundedSats: amountSats,
      amountSats,
      claimableSats: amountSats
    })
    expect(plan.claimSats).toBe(amountSats)
    expect(plan.outputSatoshis[0]).toBe(amountSats)
    expect(plan.outputSatoshis.length).toBe(2)
    expect(plan.outputSatoshis[1]).toBe(1)
  })

  it('refuses the $400 / 1-sat QA mint when claimable equals the old notional', () => {
    const amountSats = 594_598_868
    expect(() => planClaim({
      fundedSats: 1,
      amountSats,
      claimableSats: amountSats
    })).toThrow(UNFUNDED_STREAM_MESSAGE)
    try {
      planClaim({ fundedSats: 1, amountSats, claimableSats: amountSats })
      throw new Error('expected planClaim to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toBe(UNFUNDED_STREAM_MESSAGE)
      expect(JSON.stringify(error)).not.toContain(String(amountSats))
    }
  })
})

describe('dollar display from the snapshot rate', () => {
  it('scales sats against the recorded dollar amount', () => {
    expect(satsToUsd(350_000, 1_400_000, '400.00')).toBe(100)
  })
})
