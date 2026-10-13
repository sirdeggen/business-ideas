import { describe, expect, it } from 'vitest'
import { bountyHref, parseBountyLocation } from './route'

const BOUNTY_ID = 'ab'.repeat(16)
const HINT_TX = 'cd'.repeat(32)

describe('bounty deep links', () => {
  it('reads ?b= and optional ?tx=', () => {
    expect(parseBountyLocation(`?b=${BOUNTY_ID}&tx=${HINT_TX}`)).toEqual({
      bountyId: BOUNTY_ID,
      hintTxid: HINT_TX
    })
    expect(parseBountyLocation(`?b=${BOUNTY_ID}`)).toEqual({
      bountyId: BOUNTY_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /b/:id', () => {
    const href = bountyHref(BOUNTY_ID, HINT_TX)
    expect(href).toContain(`?b=${BOUNTY_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/b/')
    expect(href).not.toMatch(/\/b\/[0-9a-f]{32}/)
  })

  it('does not treat a path /b/:id as a bounty id', () => {
    expect(parseBountyLocation('', `#/b/${BOUNTY_ID}`)).toEqual({
      bountyId: null,
      hintTxid: null
    })
  })

  it('reads hash ?b= after a Pages 404 redirect', () => {
    expect(parseBountyLocation('', `#/?b=${BOUNTY_ID}&tx=${HINT_TX}`)).toEqual({
      bountyId: BOUNTY_ID,
      hintTxid: HINT_TX
    })
  })
})
