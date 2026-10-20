import { describe, expect, it } from 'vitest'
import { captureHref, parseCaptureLocation } from './route'

const REQUEST_ID = 'ab'.repeat(32)
const HINT_TX = 'cd'.repeat(32)
const PIN = `02${'ab'.repeat(32)}`

describe('capture deep links', () => {
  it('reads ?r=, ?p=, and ?tx=', () => {
    expect(parseCaptureLocation(`?r=${REQUEST_ID}&p=${PIN}&tx=${HINT_TX}`)).toEqual({
      requestId: REQUEST_ID,
      hintTxid: HINT_TX,
      pinIdentity: PIN
    })
  })

  it('builds query-param links that carry r, p, and tx', () => {
    const href = captureHref(REQUEST_ID, PIN, HINT_TX)
    expect(href).toContain(`r=${REQUEST_ID}`)
    expect(href).toContain(`p=${PIN}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/r/')
    expect(href).not.toMatch(/\/r\/[0-9a-f]{32}/)
    expect(parseCaptureLocation(`?${href.slice(href.indexOf('?') + 1)}`)).toEqual({
      requestId: REQUEST_ID,
      hintTxid: HINT_TX,
      pinIdentity: PIN
    })
  })

  it('ignores a path-shaped hash', () => {
    expect(parseCaptureLocation('', `#/r/${REQUEST_ID}`)).toEqual({
      requestId: null,
      hintTxid: null,
      pinIdentity: null
    })
  })
})
