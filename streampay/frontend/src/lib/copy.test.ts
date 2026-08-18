import { describe, expect, it } from 'vitest'
import { DEFAULT_AMOUNT_SATS, TAG, rateSatsPerSec } from '../../../protocol/stream'
import { displayAmount, displaySats } from './copy'
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
  it('shows the pot in sats, with dollars only as a display sidecar', () => {
    expect(displayAmount(stream())).toBe('100,000 sats')
    expect(displayAmount(stream({ amountUsd: '0.07' }))).toContain('100,000 sats')
    expect(displayAmount(stream({ amountUsd: '0.07' }))).toContain('$0.07')
  })

  it('shows claimable in sats, not a spot dollar conversion of the notional', () => {
    expect(displaySats(21_428, stream())).toBe('21,428 sats')
    expect(displaySats(21_428, stream())).not.toContain('$86')
  })
})
