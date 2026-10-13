import { describe, expect, it } from 'vitest'
import { MAGIC, fundPool, submitReport } from '../../../protocol/bounty'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { bookFromItems, overlayLookupService, overlayTopic, viewFromItems, type OverlayItem } from './overlay'

const ID = 'ab'.repeat(32)
const TIERS = { critical: 500_000, high: 200_000, medium: 80_000, low: 20_000 }

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host and on localhost', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('http://localhost:5188')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://localhost:5188')).not.toBe('tm_bounty')
    expect(overlayLookupService('http://localhost:5188')).not.toBe('ls_bounty')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only bounty pools on the public book', () => {
    const desk = submitReport(fundPool({
      projectName: 'Northwind Devices',
      scope: 'Public API and the firmware updater.',
      tiers: TIERS,
      payoutFeeBps: 800,
      submissionFeeSats: 1_000,
      exportFeeSats: 2_500
    }, '2026-10-13T12:00:00Z', ID), {
      researcherName: 'Ada',
      reportBody: 'sealed report',
      at: '2026-10-13T12:00:00Z'
    })
    const other = fundPool({
      projectName: 'Other Shop',
      scope: 'Other scope',
      tiers: TIERS,
      payoutFeeBps: 800,
      submissionFeeSats: 1_000,
      exportFeeSats: 2_500
    }, '2026-10-13T12:00:00Z', 'cd'.repeat(32))
    const foreign = {
      payload: { ...desk.fund!, magic: 'jobescrow' },
      txid: '11'.repeat(32),
      outputIndex: 0
    } as unknown as OverlayItem
    const items: OverlayItem[] = [
      { payload: desk.fund!, txid: 'aa'.repeat(32), outputIndex: 0 },
      { payload: desk.submission!, txid: 'aa'.repeat(32), outputIndex: 1 },
      foreign,
      { payload: other.fund!, txid: 'bb'.repeat(32), outputIndex: 0 }
    ]
    expect(items[0]?.payload.magic).toBe(MAGIC)
    const book = bookFromItems(items)
    expect(book.map((row) => row.fund.projectName).sort()).toEqual(['Northwind Devices', 'Other Shop'])
    expect(viewFromItems(items, ID)?.submission?.researcherName).toBe('Ada')
    expect(viewFromItems([foreign], ID)).toBeNull()
    expect(JSON.stringify(book)).not.toContain('sealed report')
  })
})
