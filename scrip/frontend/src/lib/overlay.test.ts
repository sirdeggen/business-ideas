import { describe, expect, it } from 'vitest'
import { MAGIC, issueBrand } from '../../../protocol/scrip'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { bookFromItems, overlayLookupService, overlayTopic, viewFromItems, type OverlayItem } from './overlay'

const ID = 'ab'.repeat(16)

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host and on localhost', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('http://localhost:5187')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://localhost:5187')).not.toBe('tm_scrip')
    expect(overlayLookupService('http://localhost:5187')).not.toBe('ls_scrip')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only scrip brands on the public book', () => {
    const desk = issueBrand({
      orgName: 'North Campus Union',
      brandName: 'Campus Cash',
      ticker: 'CAMP',
      unitLabel: 'Campus Cash',
      setupFeeSats: 5_000,
      mintFeeBps: 50,
      redeemFeeBps: 25
    }, '2026-10-06T16:00:00Z', ID)
    const other = issueBrand({
      orgName: 'Other',
      brandName: 'Other Cash',
      ticker: 'OTHR',
      unitLabel: 'Other',
      setupFeeSats: 1,
      mintFeeBps: 50,
      redeemFeeBps: 25
    }, '2026-10-06T16:00:00Z', 'cd'.repeat(16))
    const foreign = {
      payload: { ...desk.issue!, magic: 'closing' },
      txid: '11'.repeat(32),
      outputIndex: 0
    } as unknown as OverlayItem
    const items: OverlayItem[] = [
      { payload: desk.issue!, txid: 'aa'.repeat(32), outputIndex: 0 },
      foreign,
      { payload: other.issue!, txid: 'bb'.repeat(32), outputIndex: 0 }
    ]
    expect(items[0]?.payload.magic).toBe(MAGIC)
    const book = bookFromItems(items)
    expect(book.map((row) => row.issue.ticker).sort()).toEqual(['CAMP', 'OTHR'])
    expect(viewFromItems(items, ID)?.issue?.brandName).toBe('Campus Cash')
    expect(viewFromItems([foreign], ID)).toBeNull()
  })
})
