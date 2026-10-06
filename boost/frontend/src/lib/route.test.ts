import { describe, expect, it } from 'vitest'
import { parseProfileLink, parseProfileLocation, profileHref } from './route'

const PROFILE_ID = 'ab'.repeat(16)
const HINT_TX = 'cd'.repeat(32)

describe('profile deep links', () => {
  it('reads ?p= and optional ?tx=', () => {
    expect(parseProfileLocation(`?p=${PROFILE_ID}&tx=${HINT_TX}`)).toEqual({
      profileId: PROFILE_ID,
      hintTxid: HINT_TX
    })
    expect(parseProfileLocation(`?p=${PROFILE_ID}`)).toEqual({
      profileId: PROFILE_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /p/:id', () => {
    const href = profileHref(PROFILE_ID, HINT_TX)
    expect(href).toContain(`?p=${PROFILE_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/p/')
    expect(href).not.toMatch(/\/p\/[0-9a-f]{32}/)
  })

  it('does not treat a path /p/:id as a profile id', () => {
    expect(parseProfileLocation('', `#/p/${PROFILE_ID}`)).toEqual({
      profileId: null,
      hintTxid: null
    })
  })

  it('reads a pasted link and a hash query after a Pages 404 redirect', () => {
    expect(parseProfileLocation('', `#/?p=${PROFILE_ID}&tx=${HINT_TX}`)).toEqual({
      profileId: PROFILE_ID,
      hintTxid: HINT_TX
    })
    expect(parseProfileLink(`https://sirdeggen.github.io/business-ideas/boost/?p=${PROFILE_ID}&tx=${HINT_TX}`)).toEqual({
      profileId: PROFILE_ID,
      hintTxid: HINT_TX
    })
  })
})
