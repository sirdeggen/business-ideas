import { describe, expect, it } from 'vitest'
import { NOT_WHITELISTED, OVER_CAP, SAMPLE_DESTINATION, SAMPLE_MANAGER, SAMPLE_OTHER, fundMandate, openMandate, sendMandate } from '../../../protocol/mandate'
import { assertCanOpen, parseWhole } from './actions'

describe('open form', () => {
  it('accepts a mandate and the default fee before any wallet call', () => {
    expect(parseWhole('1,000,000')).toBe(1_000_000)
    expect(parseWhole('')).toBeNull()
    const ready = assertCanOpen({
      orgName: 'Harbor HOA Reserve',
      managerKey: SAMPLE_MANAGER,
      whitelist: SAMPLE_DESTINATION,
      periodCapSats: 100_000,
      periodDays: 30,
      feeBps: 800,
      noticeDays: 14
    })
    expect(ready.orgName).toBe('Harbor HOA Reserve')
    expect(ready.feeBps).toBe(800)
  })

  it('refuses a fee outside 5% to 10% before a wallet exists', () => {
    expect(() => assertCanOpen({
      orgName: 'Harbor HOA Reserve',
      managerKey: SAMPLE_MANAGER,
      whitelist: SAMPLE_DESTINATION,
      periodCapSats: 100_000,
      periodDays: 30,
      feeBps: 499,
      noticeDays: 14
    })).toThrow(/5% to 10%/)
  })

  it('refuses an unlisted destination and a send over the cap before a wallet exists', () => {
    const opened = openMandate({
      orgName: 'Harbor HOA Reserve',
      managerKey: SAMPLE_MANAGER,
      whitelist: SAMPLE_DESTINATION,
      periodCapSats: 1_000,
      periodDays: 30,
      feeBps: 800,
      noticeDays: 14
    }, '2026-10-20T00:00:00Z', 'ab'.repeat(16))
    const funded = fundMandate(opened, 50_000, '2026-10-20T00:00:00Z')
    expect(sendMandate(funded, SAMPLE_OTHER, 100, '2026-10-20T01:00:00Z').rejection).toBe(NOT_WHITELISTED)
    expect(sendMandate(funded, SAMPLE_DESTINATION, 1_001, '2026-10-20T01:00:00Z').rejection).toBe(OVER_CAP)
  })
})
