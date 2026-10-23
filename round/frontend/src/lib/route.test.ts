import { describe, expect, it } from 'vitest'
import { parseRoundLocation, roundHref } from './route'

const ROUND_ID = 'ab'.repeat(32)
const HINT_TX = 'cd'.repeat(32)
const PIN = `02${'ab'.repeat(32)}`

describe('round deep links', () => {
  it('reads ?r= and optional ?tx=', () => {
    expect(parseRoundLocation(`?r=${ROUND_ID}&tx=${HINT_TX}`)).toEqual({
      roundId: ROUND_ID,
      hintTxid: HINT_TX,
      pinIdentity: null
    })
    expect(parseRoundLocation(`?r=${ROUND_ID}`)).toEqual({
      roundId: ROUND_ID,
      hintTxid: null,
      pinIdentity: null
    })
  })

  it('reads ?p= and puts it on the link', () => {
    expect(parseRoundLocation(`?r=${ROUND_ID}&p=${PIN}`)).toEqual({
      roundId: ROUND_ID,
      hintTxid: null,
      pinIdentity: PIN
    })
    const href = roundHref(ROUND_ID, HINT_TX, PIN)
    expect(href).toContain(`p=${PIN}`)
    expect(href).not.toContain('/r/')
  })

  it('builds query-param links, never /r/:id', () => {
    const href = roundHref(ROUND_ID, HINT_TX)
    expect(href).toContain(`?r=${ROUND_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/r/')
    expect(href).not.toMatch(/\/r\/[0-9a-f]{32}/)
  })
})
