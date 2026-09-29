import { describe, expect, it } from 'vitest'
import { offerHref, parseOfferLocation } from './route'

const OFFER_ID = 'ab'.repeat(32)
const HINT_TX = 'cd'.repeat(32)

describe('inference deep links', () => {
  it('reads ?o= and optional ?tx=', () => {
    expect(parseOfferLocation(`?o=${OFFER_ID}&tx=${HINT_TX}`)).toEqual({
      offerId: OFFER_ID,
      hintTxid: HINT_TX
    })
    expect(parseOfferLocation(`?o=${OFFER_ID}`)).toEqual({
      offerId: OFFER_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /o/:id', () => {
    const href = offerHref(OFFER_ID, HINT_TX)
    expect(href).toContain(`?o=${OFFER_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/o/')
    expect(href).not.toMatch(/\/o\/[0-9a-f]{64}/)
  })

  it('does not treat a path /o/:id as an offer id', () => {
    expect(parseOfferLocation('', `#/o/${OFFER_ID}`)).toEqual({
      offerId: null,
      hintTxid: null
    })
  })

  it('reads hash ?o= after a Pages 404 redirect', () => {
    expect(parseOfferLocation('', `#/?o=${OFFER_ID}&tx=${HINT_TX}`)).toEqual({
      offerId: OFFER_ID,
      hintTxid: HINT_TX
    })
  })
})
