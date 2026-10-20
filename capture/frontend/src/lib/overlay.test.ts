import { describe, expect, it } from 'vitest'
import { MAGIC, hashCapture, postRequest, submitCapture } from '../../../protocol/capture'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { boardFromItems, overlayLookupService, overlayTopic, viewFromItems, type OverlayItem } from './overlay'

const ID = 'ab'.repeat(32)
const KEY = `02${'cd'.repeat(32)}`

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host and on localhost', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('http://localhost:5191')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://localhost:5191')).not.toBe('tm_capture')
    expect(overlayLookupService('http://localhost:5191')).not.toBe('ls_capture')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only capture requests when the rows are not yet signed', () => {
    const desk = submitCapture(postRequest({
      location: '12 Market Street',
      brief: 'Film the awning.',
      rewardSats: 100_000,
      processingFeeSats: 1_000,
      deadline: '2026-10-21T18:00:00Z',
      postedAt: '2026-10-20T12:00:00Z',
      nonce: '11'.repeat(16)
    }), {
      contributorIdentity: KEY,
      receiptHash: hashCapture('sealed-file'),
      capturedAt: '2026-10-20T12:00:00Z',
      geohash: 'u4pru',
      submittedAt: '2026-10-20T12:00:00Z'
    })
    const foreign = {
      payload: { ...desk.request!, magic: 'bounty' },
      txid: '11'.repeat(32),
      outputIndex: 0
    } as unknown as OverlayItem
    const items: OverlayItem[] = [
      { payload: desk.request!, txid: 'aa'.repeat(32), outputIndex: 0 },
      { payload: desk.submissions[0]!, txid: 'aa'.repeat(32), outputIndex: 1 },
      foreign
    ]
    expect(items[0]?.payload.magic).toBe(MAGIC)
    expect(boardFromItems(items)).toEqual([])
    expect(viewFromItems([foreign], ID)).toBeNull()
    expect(JSON.stringify(boardFromItems(items))).not.toContain('sealed-file')
  })
})
