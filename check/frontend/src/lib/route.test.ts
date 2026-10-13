import { describe, expect, it } from 'vitest'
import { checkHref, parseCheckLocation } from './route'

const CHECK_ID = 'ab'.repeat(16)
const HINT_TX = 'cd'.repeat(32)

describe('check deep links', () => {
  it('reads ?c= and optional ?tx=', () => {
    expect(parseCheckLocation(`?c=${CHECK_ID}&tx=${HINT_TX}`)).toEqual({
      checkId: CHECK_ID,
      hintTxid: HINT_TX
    })
    expect(parseCheckLocation(`?c=${CHECK_ID}`)).toEqual({
      checkId: CHECK_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /c/:id', () => {
    const href = checkHref(CHECK_ID, HINT_TX)
    expect(href).toContain(`?c=${CHECK_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/c/')
    expect(href).not.toMatch(/\/c\/[0-9a-f]{32}/)
  })

  it('does not treat a path /c/:id as a check id', () => {
    expect(parseCheckLocation('', `#/c/${CHECK_ID}`)).toEqual({
      checkId: null,
      hintTxid: null
    })
  })

  it('reads hash ?c= after a Pages 404 redirect', () => {
    expect(parseCheckLocation('', `#/?c=${CHECK_ID}&tx=${HINT_TX}`)).toEqual({
      checkId: CHECK_ID,
      hintTxid: HINT_TX
    })
  })
})
