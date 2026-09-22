import { describe, expect, it } from 'vitest'
import { parseRegisterLink, parseRegisterLocation, registerHref } from './route'

const REGISTER_ID = 'ab'.repeat(16)
const HINT_TX = 'cd'.repeat(32)

describe('register deep links', () => {
  it('reads ?r= and optional ?tx=', () => {
    expect(parseRegisterLocation(`?r=${REGISTER_ID}&tx=${HINT_TX}`)).toEqual({
      registerId: REGISTER_ID,
      hintTxid: HINT_TX
    })
    expect(parseRegisterLocation(`?r=${REGISTER_ID}`)).toEqual({
      registerId: REGISTER_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /r/:id', () => {
    const href = registerHref(REGISTER_ID, HINT_TX)
    expect(href).toContain(`?r=${REGISTER_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/r/')
    expect(href).not.toMatch(/\/r\/[0-9a-f]{32}/)
  })

  it('does not treat a path /r/:id as a register id', () => {
    expect(parseRegisterLocation('', `#/r/${REGISTER_ID}`)).toEqual({
      registerId: null,
      hintTxid: null
    })
  })

  it('reads a pasted link and a hash query after a Pages 404 redirect', () => {
    expect(parseRegisterLocation('', `#/?r=${REGISTER_ID}&tx=${HINT_TX}`)).toEqual({
      registerId: REGISTER_ID,
      hintTxid: HINT_TX
    })
    expect(parseRegisterLink(`https://sirdeggen.github.io/business-ideas/registry/?r=${REGISTER_ID}&tx=${HINT_TX}`)).toEqual({
      registerId: REGISTER_ID,
      hintTxid: HINT_TX
    })
  })
})
