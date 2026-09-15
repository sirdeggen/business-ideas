import { describe, expect, it } from 'vitest'
import { MAGIC } from '../../../protocol/handoff'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { overlayLookupService, overlayTopic, viewFromItems } from './overlay'

const SELLER = `02${'ab'.repeat(32)}`
const BUYER = `03${'cd'.repeat(32)}`
const LISTING_ID = 'a'.repeat(32)

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('https://example.com')).toBe('tm_anytx')
  })

  it('does not invent a custom topic on localhost', () => {
    expect(overlayTopic('http://localhost:5183')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://[::1]:8080')).toBe('tm_anytx')
    expect(overlayTopic('http://localhost:5183')).not.toBe('tm_handoff')
    expect(overlayLookupService('http://localhost:5183')).not.toBe('ls_handoff')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only this listing’s records', () => {
    const listTx = '11'.repeat(32)
    const fundTx = '22'.repeat(32)
    const otherTx = '33'.repeat(32)
    const view = viewFromItems([
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'list',
          listingId: LISTING_ID,
          title: 'Repo access',
          assetType: 'repo',
          description: 'Intent to transfer repo access.',
          priceSats: 100_000,
          sellerIdentity: SELLER,
          createdAt: '2026-09-01T12:00:00Z'
        },
        txid: listTx,
        outputIndex: 0
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'fund',
          listingId: LISTING_ID,
          buyerIdentity: BUYER,
          amountSats: 100_000,
          fundedAt: '2026-09-01T13:00:00Z'
        },
        txid: fundTx,
        outputIndex: 0
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'list',
          listingId: 'b'.repeat(32),
          title: 'Other',
          assetType: 'app',
          description: 'Other app.',
          priceSats: 1,
          sellerIdentity: SELLER,
          createdAt: '2026-09-01T12:00:00Z'
        },
        txid: otherTx,
        outputIndex: 0
      }
    ], LISTING_ID)

    expect(view.list?.title).toBe('Repo access')
    expect(view.fund?.buyerIdentity).toBe(BUYER)
    expect(view.status).toBe('funded')
    expect(view.list?.txid).toBe(listTx)
  })
})
