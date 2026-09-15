import { describe, expect, it } from 'vitest'
import { agentHref, parseAgentLocation } from './route'

const AGENT_ID = 'ab'.repeat(16)
const HINT_TX = 'cd'.repeat(32)

describe('agent deep links', () => {
  it('reads ?a= and optional ?tx=', () => {
    expect(parseAgentLocation(`?a=${AGENT_ID}&tx=${HINT_TX}`)).toEqual({
      agentId: AGENT_ID,
      hintTxid: HINT_TX
    })
    expect(parseAgentLocation(`?a=${AGENT_ID}`)).toEqual({
      agentId: AGENT_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /a/:id', () => {
    const href = agentHref(AGENT_ID, HINT_TX)
    expect(href).toContain(`?a=${AGENT_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/a/')
    expect(href).not.toMatch(/\/a\/[0-9a-f]{32}/)
  })

  it('does not treat a path /a/:id as an agent id', () => {
    expect(parseAgentLocation('', `#/a/${AGENT_ID}`)).toEqual({
      agentId: null,
      hintTxid: null
    })
  })

  it('reads hash ?a= after a Pages 404 redirect', () => {
    expect(parseAgentLocation('', `#/?a=${AGENT_ID}&tx=${HINT_TX}`)).toEqual({
      agentId: AGENT_ID,
      hintTxid: HINT_TX
    })
  })
})
