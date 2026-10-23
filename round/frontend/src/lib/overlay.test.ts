import { describe, expect, it } from 'vitest'
import { MAGIC, LOOKUP_SERVICE, TOPIC, openRound } from '../../../protocol/round'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { bookFromItems, overlayLookupService, overlayTopic, txAtFromContext, viewFromItems, type OverlayItem } from './overlay'

const NONCE = 'ab'.repeat(16)

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host and on localhost', () => {
    expect(PUBLIC_OVERLAY_URL).toBe('https://overlay-us-1.bsvb.tech')
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('http://localhost:5189')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://localhost:5189')).not.toBe('tm_round')
    expect(overlayLookupService('http://localhost:5189')).not.toBe('ls_round')
    expect(TOPIC).toBe('tm_anytx')
    expect(LOOKUP_SERVICE).toBe('ls_anytx')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only round raises on the public book', () => {
    const desk = openRound({
      name: 'Harbor Co-op',
      orgKind: 'coop',
      pricing: 'fixed',
      unitLabel: 'units',
      priceSats: 1_000,
      minSats: 3_000,
      maxSats: 10_000,
      deadline: '2026-10-20T16:00:00.000Z',
      requiredFields: ['member']
    }, '2026-10-13T16:00:00.000Z', NONCE)
    const other = openRound({
      name: 'North Workshop',
      orgKind: 'startup',
      pricing: 'clearing',
      unitLabel: 'units',
      priceSats: 1_000,
      minSats: 3_000,
      maxSats: 10_000,
      deadline: '2026-10-20T16:00:00.000Z',
      requiredFields: ['member']
    }, '2026-10-13T17:00:00.000Z', 'cd'.repeat(16))
    const foreign = {
      payload: { ...desk.terms!, magic: 'bounty' },
      txid: '11'.repeat(32),
      outputIndex: 0
    } as unknown as OverlayItem
    const items: OverlayItem[] = [
      { payload: desk.terms!, txid: 'aa'.repeat(32), outputIndex: 0 },
      foreign,
      { payload: other.terms!, txid: 'bb'.repeat(32), outputIndex: 0 }
    ]
    expect(items[0]?.payload.magic).toBe(MAGIC)
    expect(bookFromItems(items)).toEqual([])
    expect(viewFromItems(items, desk.terms?.roundId)).toBeNull()
    expect(viewFromItems([foreign], desk.terms?.roundId)).toBeNull()
  })

  it('reads an overlay admission time and ignores a time that is not one', () => {
    const admitted = new TextEncoder().encode(JSON.stringify({ admittedAt: '2026-10-21T16:00:00.000Z' }))
    expect(txAtFromContext(Array.from(admitted))).toBe('2026-10-21T16:00:00.000Z')
    expect(txAtFromContext(Array.from(new TextEncoder().encode('2026-10-13T16:00:00.000Z')))).toBe('2026-10-13T16:00:00.000Z')
    expect(txAtFromContext(Array.from(new TextEncoder().encode('not-a-time')))).toBeUndefined()
    expect(txAtFromContext(undefined)).toBeUndefined()
  })
})
