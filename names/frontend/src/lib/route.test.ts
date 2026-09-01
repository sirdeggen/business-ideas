import { describe, expect, it } from 'vitest'
import { nameHref, parseNameLocation } from './route'

describe('shareable name links', () => {
  it('reads ?name= and ignores path-looking values', () => {
    expect(parseNameLocation('?name=alice')).toBe('alice')
    expect(parseNameLocation('?name=Alice')).toBe('alice')
    expect(parseNameLocation('?name=foo-bar')).toBe('foo-bar')
    expect(parseNameLocation('')).toBeNull()
    expect(parseNameLocation('?name=')).toBeNull()
    expect(parseNameLocation('?name=BAD!')).toBeNull()
    expect(parseNameLocation('', '#?name=alice')).toBe('alice')
  })

  it('builds query-param links, not /name/ path routes', () => {
    expect(nameHref('Alice')).toBe('/?name=alice')
    expect(nameHref('alice')).not.toContain('/alice')
    expect(nameHref('alice')).not.toMatch(/\/names\/alice/)
  })
})
