import { describe, expect, it } from 'vitest'
import { membershipHref, parseMembershipLocation } from './route'

const MEMBERSHIP_ID = 'ab'.repeat(16)
const CREATE_TX = 'cd'.repeat(32)

describe('membership deep links', () => {
  it('reads ?m= and optional ?tx=', () => {
    expect(parseMembershipLocation(`?m=${MEMBERSHIP_ID}&tx=${CREATE_TX}`)).toEqual({
      membershipId: MEMBERSHIP_ID,
      createTxid: CREATE_TX
    })
    expect(parseMembershipLocation(`?m=${MEMBERSHIP_ID}`)).toEqual({
      membershipId: MEMBERSHIP_ID,
      createTxid: null
    })
  })

  it('builds query-param links, never /m/:id', () => {
    const href = membershipHref(MEMBERSHIP_ID, CREATE_TX)
    expect(href).toContain(`?m=${MEMBERSHIP_ID}`)
    expect(href).toContain(`tx=${CREATE_TX}`)
    expect(href).not.toContain('/m/')
    expect(href).not.toMatch(/\/m\/[0-9a-f]{32}/)
  })

  it('does not treat a path /m/:id as a membership id', () => {
    expect(parseMembershipLocation('', `#/m/${MEMBERSHIP_ID}`)).toEqual({
      membershipId: null,
      createTxid: null
    })
  })

  it('reads hash ?m= after a Pages 404 redirect', () => {
    expect(parseMembershipLocation('', `#/?m=${MEMBERSHIP_ID}&tx=${CREATE_TX}`)).toEqual({
      membershipId: MEMBERSHIP_ID,
      createTxid: CREATE_TX
    })
  })
})
