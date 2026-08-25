import { describe, expect, it } from 'vitest'
import { assertCanPost, formatSats, listingPriceSats } from './actions'

describe('listing price', () => {
  it('stores a whole sat price without a dollar face', () => {
    expect(listingPriceSats({ priceSats: 100 })).toBe(100)
    expect(formatSats(100)).toBe('100 sats')
    expect(formatSats(1)).toBe('1 sat')
    expect(formatSats(100)).not.toMatch(/\$0\.00/)
    expect(formatSats(100)).not.toMatch(/APY/)
  })

  it('requires title, license, dump, and a whole sat price', () => {
    expect(() => assertCanPost({
      title: '',
      license: 'CC-BY-4.0',
      dump: '{}',
      priceSats: 100
    })).toThrow('Title is required.')
    expect(() => assertCanPost({
      title: 'News snippet',
      license: '',
      dump: '{}',
      priceSats: 100
    })).toThrow('License is required.')
    expect(() => assertCanPost({
      title: 'News snippet',
      license: 'CC-BY-4.0',
      dump: '   ',
      priceSats: 100
    })).toThrow('Write a small dump before listing.')
    expect(() => assertCanPost({
      title: 'News snippet',
      license: 'CC-BY-4.0',
      dump: '{}',
      priceSats: 0
    })).toThrow('price must be at least 1 sat')
  })
})
