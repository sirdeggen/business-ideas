import { describe, expect, it } from 'vitest'
import { parseTraceLocation, traceHref } from './route'

describe('shareable receipt links', () => {
  it('reads ?t= and ignores empty values', () => {
    expect(parseTraceLocation('?t=a1b2c3d4e5f67890')).toBe('a1b2c3d4e5f67890')
    expect(parseTraceLocation('?t=Dawn lot 12')).toBe('dawn lot 12')
    expect(parseTraceLocation('')).toBeNull()
    expect(parseTraceLocation('?t=')).toBeNull()
    expect(parseTraceLocation('', '#?t=dawn')).toBe('dawn')
  })

  it('builds query-param links, not /trace/ path routes', () => {
    expect(traceHref('A1B2C3D4E5F67890')).toBe('/?t=a1b2c3d4e5f67890')
    expect(traceHref('Dawn lot 12')).toBe('/?t=dawn+lot+12')
    expect(traceHref('dawn')).not.toContain('/dawn')
    expect(traceHref('dawn')).not.toMatch(/\/trace\/dawn/)
  })
})
