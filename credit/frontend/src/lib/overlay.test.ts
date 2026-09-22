import { describe, expect, it } from 'vitest'
import { MAGIC } from '../../../protocol/credit'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { overlayLookupService, overlayTopic, viewFromItems } from './overlay'

const LENDER = `02${'ab'.repeat(32)}`
const DRAWER = `03${'cd'.repeat(32)}`
const FACILITY_ID = 'a'.repeat(32)

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('https://example.com')).toBe('tm_anytx')
  })

  it('does not invent a custom topic on localhost', () => {
    expect(overlayTopic('http://localhost:5184')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://[::1]:8080')).toBe('tm_anytx')
    expect(overlayTopic('http://localhost:5184')).not.toBe('tm_credit')
    expect(overlayLookupService('http://localhost:5184')).not.toBe('ls_credit')
  })
})

describe('client MAGIC filter', () => {
  it('joins term, draw, and repay for one facility', () => {
    const view = viewFromItems([
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'term',
          facilityId: FACILITY_ID,
          borrower: 'North mill cloth',
          lenderIdentity: LENDER,
          limitSats: 10_000_000,
          maturity: '2026-12-31',
          collateral: `invoice:${'b'.repeat(32)}`,
          deskFeeBps: 50,
          underwritingFeeSats: 0,
          underwritingNote: '',
          openedAt: '2026-09-22T12:00:00Z'
        },
        txid: '11'.repeat(32),
        outputIndex: 1
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'draw',
          facilityId: FACILITY_ID,
          drawId: 'd'.repeat(32),
          drawerIdentity: DRAWER,
          principalSats: 1_000_000,
          feeSats: 5_000,
          drawnAt: '2026-09-23T12:00:00Z'
        },
        txid: '22'.repeat(32),
        outputIndex: 1
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'term',
          facilityId: 'b'.repeat(32),
          borrower: 'Other',
          lenderIdentity: LENDER,
          limitSats: 1,
          maturity: '2026-12-31',
          collateral: `receivable:INV-1`,
          deskFeeBps: 50,
          underwritingFeeSats: 0,
          underwritingNote: '',
          openedAt: '2026-09-22T12:00:00Z'
        },
        txid: '33'.repeat(32),
        outputIndex: 0
      }
    ], FACILITY_ID)

    expect(view.term?.borrower).toBe('North mill cloth')
    expect(view.draws).toHaveLength(1)
    expect(view.outstanding).toBe(1_000_000)
    expect(view.available).toBe(9_000_000)
    expect(view.status).toBe('drawn')
    expect(view.term?.collateral).toContain('invoice:')
  })
})
