import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  SCHEMA_VERSION,
  decideSpend,
  encodePolicyFields,
  encodeSpendFields,
  parseSpendPolicyFields,
  remainingDailyCap,
  type PolicyPayload,
  type SpendPayload
} from '../../../protocol/spendpolicy'

const TREASURER = `02${'ab'.repeat(32)}`
const PAYEE = `03${'cd'.repeat(32)}`
const STRANGER = `02${'ef'.repeat(32)}`
const POLICY_ID = 'a'.repeat(32)

function policy(overrides: Partial<PolicyPayload> = {}): PolicyPayload {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'policy',
    policyId: POLICY_ID,
    treasurer: TREASURER,
    dailyCapSats: 100_000,
    expiry: '2026-09-08T12:00:00Z',
    payees: [{ identityKey: PAYEE, name: 'Office vendor' }],
    createdAt: '2026-08-25T12:00:00Z',
    ...overrides
  }
}

function spend(overrides: Partial<SpendPayload> = {}): SpendPayload {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'spend',
    policyId: POLICY_ID,
    spender: TREASURER,
    payee: PAYEE,
    amountSats: 40_000,
    spentAt: '2026-08-25T15:00:00Z',
    ...overrides
  }
}

describe('policy allow / deny', () => {
  it('allows a listed payee within the remaining daily cap before expiry', () => {
    const decision = decideSpend({
      policy: policy(),
      payeeIdentity: PAYEE,
      amountSats: 60_000,
      now: new Date('2026-08-25T16:00:00Z'),
      spends: [spend()]
    })
    expect(decision).toEqual({ ok: true })
  })

  it('refuses an unknown payee with a human sentence', () => {
    const decision = decideSpend({
      policy: policy(),
      payeeIdentity: STRANGER,
      amountSats: 1_000,
      now: new Date('2026-08-25T16:00:00Z'),
      spends: []
    })
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.reason).toBe('This policy does not allow a spend to that payee.')
  })

  it('refuses a spend over the remaining daily cap', () => {
    const decision = decideSpend({
      policy: policy(),
      payeeIdentity: PAYEE,
      amountSats: 70_000,
      now: new Date('2026-08-25T16:00:00Z'),
      spends: [spend()]
    })
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.reason).toBe('This spend is 70,000 sats. Only 60,000 sats remain on today’s cap.')
  })

  it('refuses when the daily cap is already used', () => {
    const decision = decideSpend({
      policy: policy(),
      payeeIdentity: PAYEE,
      amountSats: 1,
      now: new Date('2026-08-25T16:00:00Z'),
      spends: [spend({ amountSats: 100_000 })]
    })
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.reason).toBe('This policy’s daily cap is already used.')
  })

  it('refuses after expiry', () => {
    const decision = decideSpend({
      policy: policy({ expiry: '2026-08-20T12:00:00Z' }),
      payeeIdentity: PAYEE,
      amountSats: 1_000,
      now: new Date('2026-08-25T16:00:00Z'),
      spends: []
    })
    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.reason).toMatch(/^This policy expired on /)
    expect(decision.reason).toMatch(/2026/)
  })

  it('does not count yesterday’s spends against today’s cap', () => {
    expect(remainingDailyCap(
      policy(),
      [spend({ spentAt: '2026-08-24T23:00:00Z', amountSats: 100_000 })],
      new Date('2026-08-25T01:00:00Z')
    )).toBe(100_000)
  })
})

describe('policy encode / decode', () => {
  it('round-trips a policy and a spend announcement', () => {
    const written = policy()
    const parsedPolicy = parseSpendPolicyFields(encodePolicyFields(written))
    expect(parsedPolicy).toEqual(written)

    const recorded = spend({ payeeName: 'Office vendor' })
    const parsedSpend = parseSpendPolicyFields(encodeSpendFields(recorded))
    expect(parsedSpend).toEqual(recorded)
  })

  it('keeps the protocol string at least five characters', () => {
    expect(MAGIC.length).toBeGreaterThanOrEqual(5)
    expect(MAGIC).toBe('spendpolicy')
  })
})
