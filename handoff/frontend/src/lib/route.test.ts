import { describe, expect, it } from 'vitest'
import { listingHref, parseListingLocation } from './route'

const LISTING_ID = 'ab'.repeat(16)
const HINT_TX = 'cd'.repeat(32)

describe('handoff deep links', () => {
  it('reads ?h= and optional ?tx=', () => {
    expect(parseListingLocation(`?h=${LISTING_ID}&tx=${HINT_TX}`)).toEqual({
      listingId: LISTING_ID,
      hintTxid: HINT_TX
    })
    expect(parseListingLocation(`?h=${LISTING_ID}`)).toEqual({
      listingId: LISTING_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /h/:id', () => {
    const href = listingHref(LISTING_ID, HINT_TX)
    expect(href).toContain(`?h=${LISTING_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/h/')
    expect(href).not.toMatch(/\/h\/[0-9a-f]{32}/)
  })

  it('does not treat a path /h/:id as a listing id', () => {
    expect(parseListingLocation('', `#/h/${LISTING_ID}`)).toEqual({
      listingId: null,
      hintTxid: null
    })
  })

  it('reads hash ?h= after a Pages 404 redirect', () => {
    expect(parseListingLocation('', `#/?h=${LISTING_ID}&tx=${HINT_TX}`)).toEqual({
      listingId: LISTING_ID,
      hintTxid: HINT_TX
    })
  })
})
