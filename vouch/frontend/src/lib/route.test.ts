import { describe, expect, it } from 'vitest'
import { parseVouchLocation, vouchHref } from './route'

describe('shareable vouch links', () => {
  it('reads ?v= and ignores empty values', () => {
    expect(parseVouchLocation('?v=a1b2c3d4e5f67890')).toBe('a1b2c3d4e5f67890')
    expect(parseVouchLocation('?v=North Mill')).toBe('north mill')
    expect(parseVouchLocation('')).toBeNull()
    expect(parseVouchLocation('?v=')).toBeNull()
    expect(parseVouchLocation('', '#?v=north')).toBe('north')
  })

  it('builds query-param links, not /vouch/ path routes', () => {
    expect(vouchHref('A1B2C3D4E5F67890')).toBe('/?v=a1b2c3d4e5f67890')
    expect(vouchHref('North Mill')).toBe('/?v=north+mill')
    expect(vouchHref('north')).not.toContain('/north')
    expect(vouchHref('north')).not.toMatch(/\/vouch\/north/)
  })
})
