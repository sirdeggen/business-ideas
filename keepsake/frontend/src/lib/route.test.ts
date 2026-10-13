import { describe, expect, it } from 'vitest'
import { keepsakeHref, parseKeepsakeLocation } from './route'

const KEEPSAKE_ID = 'ab'.repeat(16)
const HINT_TX = 'cd'.repeat(32)

describe('keepsake deep links', () => {
  it('reads ?k= and optional ?tx=', () => {
    expect(parseKeepsakeLocation(`?k=${KEEPSAKE_ID}&tx=${HINT_TX}`)).toEqual({
      keepsakeId: KEEPSAKE_ID,
      hintTxid: HINT_TX
    })
    expect(parseKeepsakeLocation(`?k=${KEEPSAKE_ID}`)).toEqual({
      keepsakeId: KEEPSAKE_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /k/:id', () => {
    const href = keepsakeHref(KEEPSAKE_ID, HINT_TX)
    expect(href).toContain(`?k=${KEEPSAKE_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/k/')
    expect(href).not.toMatch(/\/k\/[0-9a-f]{32}/)
  })

  it('does not treat a path /k/:id as a keepsake id', () => {
    expect(parseKeepsakeLocation('', `#/k/${KEEPSAKE_ID}`)).toEqual({
      keepsakeId: null,
      hintTxid: null
    })
  })

  it('reads hash ?k= after a Pages 404 redirect', () => {
    expect(parseKeepsakeLocation('', `#/?k=${KEEPSAKE_ID}&tx=${HINT_TX}`)).toEqual({
      keepsakeId: KEEPSAKE_ID,
      hintTxid: HINT_TX
    })
  })
})
