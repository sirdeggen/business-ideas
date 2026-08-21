import { describe, expect, it } from 'vitest'
import { DEFAULT_AMOUNT_SATS, TAG, rateSatsPerSec } from '../../../protocol/stream'
import {
  CLOCK_STOPPED,
  FREEZE_HINT,
  RECEIPT_CARD,
  STREAM_CARD,
  accruedLine,
  claimLabel,
  dailyRate,
  displayAmount,
  displayMoney,
  displaySats,
  remainingLine,
  remainingPotSats
} from './copy'
import type { OverlayStream } from './overlay'

function stream(partial: Partial<OverlayStream> = {}): OverlayStream {
  const amountSats = partial.amountSats ?? DEFAULT_AMOUNT_SATS
  const durationSec = 14 * 86_400
  return {
    tag: TAG,
    streamId: 'ab'.repeat(16),
    org: 'Harbor Legal Aid',
    contractorName: 'Jordan Lee',
    contractorIdentity: `03${'11'.repeat(32)}`,
    treasurerIdentity: '025706528f0f6894b2ba505007267ccff1133e004452a1f6b72ac716f246216366',
    amountSats,
    rateSatsPerSec: rateSatsPerSec(amountSats, durationSec),
    startIso: '2026-08-11T12:00:00.000Z',
    durationSec,
    frozen: false,
    claimedSats: 0,
    freezeIso: '',
    amountUsd: partial.amountUsd ?? '0.07',
    memo: 'Legal research week',
    updatedIso: '2026-08-11T12:00:00.000Z',
    lastClaimSats: 0,
    lastClaimIso: '',
    txid: 'aa'.repeat(32),
    outputIndex: 0,
    satoshis: amountSats,
    ...partial
  }
}

describe('stream copy is dollars on the sheet', () => {
  it('leads with recorded dollars; sats stay a helper', () => {
    expect(displayAmount(stream())).toBe('$0.07')
    expect(displayAmount(stream({ amountUsd: '0.07' }))).toBe('$0.07')
    expect(displayAmount(stream())).not.toContain('sats')
    expect(displayMoney(21_428, stream())).toBe('$0.01')
    expect(displaySats(21_428)).toBe('21,428 sats')
    expect(displaySats(14)).not.toMatch(/\$0\.0[01]/)
    expect(claimLabel(21_428, stream())).toBe('Claim $0.01')
    expect(claimLabel(21_428, stream())).not.toContain('sats')
    expect(claimLabel(0, stream())).toBe('Nothing to claim yet')
    expect(dailyRate(stream())).toBe('$0.005')
  })

  it('does not invent a spot dollar conversion when no snapshot exists', () => {
    const raw = stream({ amountUsd: '' })
    expect(displayAmount(raw)).toBe('100,000 sats')
    expect(displayMoney(21_428, raw)).toBe('21,428 sats')
    expect(displayMoney(21_428, raw)).not.toContain('$86')
    expect(claimLabel(21_428, raw)).toBe('Claim 21,428 sats')
  })

  it('writes the remaining pot after a claim (QA 78,559)', () => {
    const afterClaim = stream({ satoshis: 100_000, claimedSats: 21_441 })
    expect(remainingPotSats(afterClaim)).toBe(78_559)
    expect(remainingLine(afterClaim)).toBe('$0.05 remaining')
    expect(accruedLine(afterClaim, Date.parse(afterClaim.startIso) + 3 * 86_400_000)).toContain('$0.05 remaining')
    expect(remainingLine(afterClaim)).not.toContain('sats')
  })

  it('says who can freeze and what freeze does', () => {
    expect(FREEZE_HINT).toMatch(/opened this stream/i)
    expect(FREEZE_HINT).toMatch(/stops new pay from accruing/i)
    expect(FREEZE_HINT).toMatch(/already-accrued can still be claimed/i)
    expect(CLOCK_STOPPED).toMatch(/clock is stopped/i)
    expect(CLOCK_STOPPED).toMatch(/already-accrued can still be claimed/i)
  })

  it('names the OPEN stream card and the CLAIMED receipt card', () => {
    expect(STREAM_CARD).toBe('Stream')
    expect(RECEIPT_CARD).toBe('Receipt')
  })
})
