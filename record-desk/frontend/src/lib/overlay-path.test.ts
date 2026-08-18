import { describe, expect, it } from 'vitest'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { overlayLookupService, overlayTopic, usesPublicAnytx } from './overlay'

describe('public vs local overlay topic selection', () => {
  it('keeps tm_records / ls_records on localhost Docker', () => {
    expect(usesPublicAnytx('http://localhost:8083')).toBe(false)
    expect(overlayTopic('http://localhost:8083')).toBe('tm_records')
    expect(overlayLookupService('http://localhost:8083')).toBe('ls_records')
    expect(overlayTopic('http://127.0.0.1:8083/')).toBe('tm_records')
    expect(overlayLookupService('http://127.0.0.1:8083/')).toBe('ls_records')
  })

  it('selects tm_anytx / ls_anytx on the public overlay host', () => {
    expect(usesPublicAnytx(PUBLIC_OVERLAY_URL)).toBe(true)
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe('tm_anytx')
    expect(overlayLookupService('https://overlay-us-1.bsvb.tech/')).toBe('ls_anytx')
  })
})
