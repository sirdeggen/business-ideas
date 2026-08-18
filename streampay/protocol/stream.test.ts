import { describe, expect, it } from 'vitest'
import {
  TAG,
  accrue,
  encodeStreamFields,
  joinStreamRecords,
  parseStreamFields,
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

  it('earns day-3 of a 14-day $400 stream as 3/14 of the sats', () => {
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
  })
})

describe('dollar display from the snapshot rate', () => {
  it('scales sats against the recorded dollar amount', () => {
    expect(satsToUsd(350_000, 1_400_000, '400.00')).toBe(100)
  })
})
