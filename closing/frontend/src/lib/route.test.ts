import { describe, expect, it } from 'vitest'
import { closingHref, parseClosingLocation } from './route'

const CLOSING_ID = 'ab'.repeat(16)
const HINT_TX = 'cd'.repeat(32)

describe('closing deep links', () => {
  it('reads ?c= and optional ?tx=', () => {
    expect(parseClosingLocation(`?c=${CLOSING_ID}&tx=${HINT_TX}`)).toEqual({
      closingId: CLOSING_ID,
      hintTxid: HINT_TX
    })
    expect(parseClosingLocation(`?c=${CLOSING_ID}`)).toEqual({
      closingId: CLOSING_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /c/:id', () => {
    const href = closingHref(CLOSING_ID, HINT_TX)
    expect(href).toContain(`?c=${CLOSING_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/c/')
    expect(href).not.toMatch(/\/c\/[0-9a-f]{32}/)
  })

  it('does not treat a path /c/:id as a closing id', () => {
    expect(parseClosingLocation('', `#/c/${CLOSING_ID}`)).toEqual({
      closingId: null,
      hintTxid: null
    })
  })

  it('reads hash ?c= after a Pages 404 redirect', () => {
    expect(parseClosingLocation('', `#/?c=${CLOSING_ID}&tx=${HINT_TX}`)).toEqual({
      closingId: CLOSING_ID,
      hintTxid: HINT_TX
    })
  })
})
