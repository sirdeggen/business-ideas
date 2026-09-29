import { describe, expect, it } from 'vitest'
import { parsePolicyLink, parsePolicyLocation, policyHref } from './route'

const POLICY_ID = 'ab'.repeat(16)
const HINT_TX = 'cd'.repeat(32)

describe('policy deep links', () => {
  it('reads ?p= and optional ?tx=', () => {
    expect(parsePolicyLocation(`?p=${POLICY_ID}&tx=${HINT_TX}`)).toEqual({
      policyId: POLICY_ID,
      hintTxid: HINT_TX
    })
    expect(parsePolicyLocation(`?p=${POLICY_ID}`)).toEqual({
      policyId: POLICY_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /p/:id', () => {
    const href = policyHref(POLICY_ID, HINT_TX)
    expect(href).toContain(`?p=${POLICY_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/p/')
    expect(href).not.toMatch(/\/p\/[0-9a-f]{32}/)
  })

  it('does not treat a path /p/:id as a policy id', () => {
    expect(parsePolicyLocation('', `#/p/${POLICY_ID}`)).toEqual({
      policyId: null,
      hintTxid: null
    })
  })

  it('reads a pasted link and a hash query after a Pages 404 redirect', () => {
    expect(parsePolicyLocation('', `#/?p=${POLICY_ID}&tx=${HINT_TX}`)).toEqual({
      policyId: POLICY_ID,
      hintTxid: HINT_TX
    })
    expect(parsePolicyLink(`https://sirdeggen.github.io/business-ideas/cover/?p=${POLICY_ID}&tx=${HINT_TX}`)).toEqual({
      policyId: POLICY_ID,
      hintTxid: HINT_TX
    })
  })
})
