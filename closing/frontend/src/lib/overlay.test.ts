import { describe, expect, it } from 'vitest'
import { MAGIC } from '../../../protocol/closing'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { overlayLookupService, overlayTopic, viewFromItems } from './overlay'

const SELLER = `02${'ab'.repeat(32)}`
const BUYER = `03${'cd'.repeat(32)}`
const CLOSING_ID = 'a'.repeat(32)
const HASH = 'b'.repeat(64)

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host and on localhost', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('http://localhost:5185')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://localhost:5185')).not.toBe('tm_closing')
    expect(overlayLookupService('http://localhost:5185')).not.toBe('ls_closing')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only this closing’s records', () => {
    const view = viewFromItems([
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'open',
          closingId: CLOSING_ID,
          label: 'Mineral interest',
          amountSats: 1_000_000,
          feeBps: 100,
          amendmentFeeSats: 0,
          payeeIdentity: SELLER,
          payeeName: 'Seller',
          originalPayeeIdentity: SELLER,
          originalPayeeName: 'Seller',
          buyerIdentity: BUYER,
          buyerName: 'Buyer',
          agentIdentity: '',
          agentName: '',
          threshold: 2,
          createdAt: '2026-09-01T12:00:00Z'
        },
        txid: '11'.repeat(32),
        outputIndex: 0
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'open',
          closingId: 'b'.repeat(32),
          label: 'Other',
          amountSats: 2,
          feeBps: 100,
          amendmentFeeSats: 0,
          payeeIdentity: SELLER,
          payeeName: 'Seller',
          originalPayeeIdentity: SELLER,
          originalPayeeName: 'Seller',
          buyerIdentity: BUYER,
          buyerName: 'Buyer',
          agentIdentity: '',
          agentName: '',
          threshold: 2,
          createdAt: '2026-09-01T12:00:00Z'
        },
        txid: '22'.repeat(32),
        outputIndex: 0
      }
    ], CLOSING_ID)

    expect(view?.open?.label).toBe('Mineral interest')
    expect(view?.open?.closingId).toBe(CLOSING_ID)
    expect(HASH).toHaveLength(64)
  })
})
