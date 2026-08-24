import { describe, expect, it } from 'vitest'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { overlayLookupService, overlayTopic, usesPublicAnytx } from './overlay'

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx when the host is not localhost', () => {
    expect(usesPublicAnytx(PUBLIC_OVERLAY_URL)).toBe(true)
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('https://example.com')).toBe('tm_anytx')
  })

  it('keeps the local Docker topic only on localhost', () => {
    expect(usesPublicAnytx('http://localhost:8084')).toBe(false)
    expect(overlayTopic('http://localhost:8084')).toBe('tm_raffle')
    expect(overlayLookupService('http://127.0.0.1:8084')).toBe('ls_raffle')
    expect(overlayTopic('http://[::1]:8084')).toBe('tm_raffle')
  })
})
