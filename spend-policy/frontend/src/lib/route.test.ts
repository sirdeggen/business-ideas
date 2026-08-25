import { describe, expect, it } from 'vitest'
import { parsePolicyLocation, policyHref } from './route'

const POLICY_ID = 'ab'.repeat(16)
const CREATE_TX = 'cd'.repeat(32)

describe('spend policy deep links', () => {
  it('reads ?p= and optional ?tx=', () => {
    expect(parsePolicyLocation(`?p=${POLICY_ID}&tx=${CREATE_TX}`)).toEqual({
      policyId: POLICY_ID,
      createTxid: CREATE_TX
    })
    expect(parsePolicyLocation(`?p=${POLICY_ID}`)).toEqual({
      policyId: POLICY_ID,
      createTxid: null
    })
  })

  it('builds query-param links, never /p/:id', () => {
    const href = policyHref(POLICY_ID, CREATE_TX)
    expect(href).toContain(`?p=${POLICY_ID}`)
    expect(href).toContain(`tx=${CREATE_TX}`)
    expect(href).not.toContain('/p/')
    expect(href).not.toMatch(/\/p\/[0-9a-f]{32}/)
  })

  it('does not treat a path /p/:id as a policy id', () => {
    expect(parsePolicyLocation('', `#/p/${POLICY_ID}`)).toEqual({
      policyId: null,
      createTxid: null
    })
  })
})
