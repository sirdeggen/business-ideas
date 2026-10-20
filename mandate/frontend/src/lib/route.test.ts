import { describe, expect, it } from 'vitest'
import { mandateHref, parseMandateLocation } from './route'

const MANDATE_ID = 'ab'.repeat(32)
const HINT_TX = 'cd'.repeat(32)

describe('mandate deep links', () => {
  it('reads ?m= and optional ?tx=', () => {
    expect(parseMandateLocation(`?m=${MANDATE_ID}&tx=${HINT_TX}`)).toEqual({
      mandateId: MANDATE_ID,
      hintTxid: HINT_TX
    })
    expect(parseMandateLocation(`?m=${MANDATE_ID}`)).toEqual({
      mandateId: MANDATE_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /m/:id', () => {
    const href = mandateHref(MANDATE_ID, HINT_TX)
    expect(href).toContain(`?m=${MANDATE_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/m/')
    expect(href).not.toMatch(/\/m\/[0-9a-f]{64}/)
  })

  it('does not treat a path /m/:id as a mandate id', () => {
    expect(parseMandateLocation('', `#/m/${MANDATE_ID}`)).toEqual({
      mandateId: null,
      hintTxid: null
    })
  })

  it('reads hash ?m= after a Pages 404 redirect', () => {
    expect(parseMandateLocation('', `#/?m=${MANDATE_ID}&tx=${HINT_TX}`)).toEqual({
      mandateId: MANDATE_ID,
      hintTxid: HINT_TX
    })
  })
})
