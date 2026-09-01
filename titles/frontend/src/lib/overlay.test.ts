import { describe, expect, it } from 'vitest'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { overlayLookupService, overlayTopic, usesPublicAnytx } from './overlay'

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public overlay', () => {
    expect(usesPublicAnytx(PUBLIC_OVERLAY_URL)).toBe(true)
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
  })

  it('does not invent a custom topic on localhost', () => {
    expect(overlayTopic('http://localhost:5179')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:5179')).toBe('ls_anytx')
    expect(overlayTopic('http://[::1]:5179')).toBe('tm_anytx')
    expect(overlayTopic('http://localhost:5179')).not.toBe('tm_titles')
    expect(overlayLookupService('http://localhost:5179')).not.toBe('ls_titles')
  })
})
