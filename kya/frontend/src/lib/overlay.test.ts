import { describe, expect, it } from 'vitest'
import { MAGIC } from '../../../protocol/kya'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { overlayLookupService, overlayTopic, viewFromItems } from './overlay'

const OWNER = `02${'ab'.repeat(32)}`
const VERIFIER = `03${'cd'.repeat(32)}`
const AGENT_ID = 'a'.repeat(32)
const CREDENTIAL_ID = 'b'.repeat(64)

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('https://example.com')).toBe('tm_anytx')
  })

  it('does not invent a custom topic on localhost', () => {
    expect(overlayTopic('http://localhost:5183')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://[::1]:8080')).toBe('tm_anytx')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only this agent’s bind, credential, and receipts', () => {
    const bindTx = '11'.repeat(32)
    const credTx = '22'.repeat(32)
    const recTx = '33'.repeat(32)
    const otherTx = '44'.repeat(32)
    const view = viewFromItems([
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'bind',
          agentId: AGENT_ID,
          agentName: 'Travel clerk',
          ownerName: 'Northwind',
          ownerIdentity: OWNER,
          createdAt: '2026-09-01T12:00:00Z'
        },
        txid: bindTx,
        outputIndex: 0
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'credential',
          agentId: AGENT_ID,
          credentialId: CREDENTIAL_ID,
          ownerIdentity: OWNER,
          issuedAt: '2026-09-01T13:00:00Z'
        },
        txid: credTx,
        outputIndex: 0
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'receipt',
          agentId: AGENT_ID,
          credentialId: CREDENTIAL_ID,
          verifierIdentity: VERIFIER,
          verifierName: 'Desk',
          feeSats: 500,
          protocolFeeSats: 10,
          verifiedAt: '2026-09-01T14:00:00Z'
        },
        txid: recTx,
        outputIndex: 2
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'bind',
          agentId: 'b'.repeat(32),
          agentName: 'Other',
          ownerName: 'Bea',
          ownerIdentity: OWNER,
          createdAt: '2026-09-01T12:00:00Z'
        },
        txid: otherTx,
        outputIndex: 0
      }
    ], AGENT_ID)

    expect(view.bind?.agentName).toBe('Travel clerk')
    expect(view.credential?.credentialId).toBe(CREDENTIAL_ID)
    expect(view.receipts).toHaveLength(1)
    expect(view.status).toBe('verified')
    expect(view.bind?.txid).toBe(bindTx)
  })
})
