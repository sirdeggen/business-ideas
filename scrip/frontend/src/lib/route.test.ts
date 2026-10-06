import { describe, expect, it } from 'vitest'
import { parseScripLocation, scripHref } from './route'

const SCRIP_ID = 'ab'.repeat(16)
const HINT_TX = 'cd'.repeat(32)

describe('scrip deep links', () => {
  it('reads ?s= and optional ?tx=', () => {
    expect(parseScripLocation(`?s=${SCRIP_ID}&tx=${HINT_TX}`)).toEqual({
      scripId: SCRIP_ID,
      hintTxid: HINT_TX
    })
    expect(parseScripLocation(`?s=${SCRIP_ID}`)).toEqual({
      scripId: SCRIP_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /s/:id', () => {
    const href = scripHref(SCRIP_ID, HINT_TX)
    expect(href).toContain(`?s=${SCRIP_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/s/')
    expect(href).not.toMatch(/\/s\/[0-9a-f]{32}/)
  })

  it('does not treat a path /s/:id as a scrip id', () => {
    expect(parseScripLocation('', `#/s/${SCRIP_ID}`)).toEqual({
      scripId: null,
      hintTxid: null
    })
  })

  it('reads hash ?s= after a Pages 404 redirect', () => {
    expect(parseScripLocation('', `#/?s=${SCRIP_ID}&tx=${HINT_TX}`)).toEqual({
      scripId: SCRIP_ID,
      hintTxid: HINT_TX
    })
  })
})
