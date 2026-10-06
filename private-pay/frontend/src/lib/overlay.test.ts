import { describe, expect, it } from 'vitest'
import { MAGIC } from '../../../protocol/private-pay'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { overlayLookupService, overlayTopic, viewFromItems, type OverlayItem } from './overlay'

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('https://example.com')).toBe('tm_anytx')
  })

  it('does not invent a custom topic on localhost', () => {
    expect(overlayTopic('http://localhost:5187')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://[::1]:8080')).toBe('tm_anytx')
  })
})

describe('client MAGIC filter', () => {
  it('drops a record from another desk', () => {
    const foreign = {
      payload: {
        magic: 'cover',
        version: '1',
        kind: 'payment',
        paymentId: 'ab'.repeat(16)
      },
      txid: '11'.repeat(32),
      outputIndex: 0
    } as unknown as OverlayItem
    const view = viewFromItems([foreign], 'ab'.repeat(16))
    expect(view.payment).toBeNull()
    expect(MAGIC).toBe('private-pay')
  })
})
