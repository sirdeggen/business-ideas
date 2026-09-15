import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_VERIFY_SATS, protocolFeeSats } from '../../../protocol/kya'
import { assertCanIssue, assertCanRegister, assertCanVerify } from './actions'
import { NO_CREDENTIAL, NOT_OWNER } from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const actionsSrc = readFileSync(join(here, 'actions.ts'), 'utf8')

const OWNER = `02${'ab'.repeat(32)}`
const OTHER = `03${'cd'.repeat(32)}`
const AGENT_ID = 'a'.repeat(32)
const CREDENTIAL_ID = 'b'.repeat(64)

const bind = {
  magic: 'kya' as const,
  version: '1' as const,
  kind: 'bind' as const,
  agentId: AGENT_ID,
  agentName: 'Travel clerk',
  ownerName: 'Northwind',
  ownerIdentity: OWNER,
  createdAt: '2026-09-01T12:00:00Z',
  txid: '11'.repeat(32),
  outputIndex: 0
}

const credential = {
  magic: 'kya' as const,
  version: '1' as const,
  kind: 'credential' as const,
  agentId: AGENT_ID,
  credentialId: CREDENTIAL_ID,
  ownerIdentity: OWNER,
  issuedAt: '2026-09-01T13:00:00Z',
  txid: '22'.repeat(32),
  outputIndex: 0
}

describe('register / issue / verify gates', () => {
  it('requires an agent name and owner name', () => {
    expect(() => assertCanRegister({ agentName: '', ownerName: 'Northwind' })).toThrow('Agent name is required.')
    expect(() => assertCanRegister({ agentName: 'Travel clerk', ownerName: '  ' })).toThrow('Owner name is required.')
    expect(assertCanRegister({ agentName: 'Travel clerk', ownerName: 'Northwind' })).toEqual({
      agentName: 'Travel clerk',
      ownerName: 'Northwind'
    })
  })

  it('lets only the owner issue, and only after a bind', () => {
    expect(() => assertCanIssue(bind, OWNER)).not.toThrow()
    expect(() => assertCanIssue(bind, OTHER)).toThrow(NOT_OWNER)
  })

  it('requires a credential before pay-to-verify and labels the protocol fee', () => {
    expect(() => assertCanVerify(bind, null, {
      feeSats: DEFAULT_VERIFY_SATS,
      verifierName: ''
    })).toThrow(NO_CREDENTIAL)
    expect(assertCanVerify(bind, credential, {
      feeSats: DEFAULT_VERIFY_SATS,
      verifierName: 'Desk'
    })).toEqual({
      feeSats: 500,
      protocolFeeSats: 10,
      verifierName: 'Desk'
    })
    expect(protocolFeeSats(500)).toBe(10)
  })
})

describe('createAction rails', () => {
  it('posts bind, credential, and a labeled verify receipt', () => {
    expect(actionsSrc).toContain('wallet.createAction')
    expect(actionsSrc).toContain("tags: [BASKET, 'bind', agentId]")
    expect(actionsSrc).toContain("tags: [BASKET, 'credential', bind.agentId]")
    expect(actionsSrc).toContain("tags: [BASKET, 'receipt', bind.agentId]")
    expect(actionsSrc).toContain('outputDescription: `Verify fee for ${bind.agentName}`')
    expect(actionsSrc).toContain('outputDescription: `KYA protocol fee for ${bind.agentName}`')
    expect(actionsSrc).toContain('submitKyaTx')
    expect(actionsSrc).not.toMatch(/ethereum|solana|evm/i)
  })
})
