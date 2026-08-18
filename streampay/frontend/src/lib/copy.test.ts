import { describe, expect, it } from 'vitest'
import { DEFAULT_AMOUNT_SATS, TAG, rateSatsPerSec } from '../../../protocol/stream'
import {
  FREEZE_HINT,
  RECEIPT_CARD,
  STREAM_CARD,
  accruedLine,
  claimLabel,
  displayAmount,
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
    amountUsd: partial.amountUsd ?? '',
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

describe('stream copy is sat-first', () => {
  it('leads with sats and drops paired USD on the stream page', () => {
    expect(displayAmount(stream())).toBe('100,000 sats')
    expect(displayAmount(stream({ amountUsd: '0.07' }))).toBe('100,000 sats')
    expect(displayAmount(stream({ amountUsd: '0.07' }))).not.toContain('$')
    expect(displaySats(21_428)).toBe('21,428 sats')
    expect(displaySats(14)).not.toMatch(/\$0\.0[01]/)
    expect(claimLabel(14)).toBe('Claim 14 sats')
    expect(claimLabel(14)).not.toContain('$')
    expect(claimLabel(0)).toBe('Nothing to claim yet')
  })

  it('shows claimable in sats, not a spot dollar conversion of the notional', () => {
    expect(displaySats(21_428)).toBe('21,428 sats')
    expect(displaySats(21_428)).not.toContain('$86')
  })

  it('writes the remaining pot after a claim (QA 78,559)', () => {
    const afterClaim = stream({ satoshis: 100_000, claimedSats: 21_441 })
    expect(remainingPotSats(afterClaim)).toBe(78_559)
    expect(remainingLine(afterClaim)).toBe('78,559 sats remaining')
    expect(accruedLine(afterClaim, Date.parse(afterClaim.startIso) + 3 * 86_400_000)).toContain('78,559 sats remaining')
  })

  it('says who can freeze and what freeze does', () => {
    expect(FREEZE_HINT).toMatch(/opened this stream/i)
    expect(FREEZE_HINT).toMatch(/stops new pay from accruing/i)
    expect(FREEZE_HINT).toMatch(/already-accrued can still be claimed/i)
  })

  it('names the OPEN stream card and the CLAIMED receipt card', () => {
    expect(STREAM_CARD).toBe('Stream')
    expect(RECEIPT_CARD).toBe('Receipt')
  })
})
