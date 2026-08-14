import { describe, expect, it } from 'vitest'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { overlayLookupService, overlayTopic, usesPublicAnytx } from './overlay'

describe('public vs local overlay topic selection', () => {
  it('keeps tm_invoices / ls_invoices on localhost Docker', () => {
    expect(usesPublicAnytx('http://localhost:8081')).toBe(false)
    expect(overlayTopic('http://localhost:8081')).toBe('tm_invoices')
    expect(overlayLookupService('http://localhost:8081')).toBe('ls_invoices')
    expect(overlayTopic('http://127.0.0.1:8081/')).toBe('tm_invoices')
    expect(overlayLookupService('http://127.0.0.1:8081/')).toBe('ls_invoices')
  })

  it('selects tm_anytx / ls_anytx on the public overlay host', () => {
    expect(usesPublicAnytx(PUBLIC_OVERLAY_URL)).toBe(true)
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe('tm_anytx')
    expect(overlayLookupService('https://overlay-us-1.bsvb.tech/')).toBe('ls_anytx')
  })
})
