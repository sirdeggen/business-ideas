import { describe, expect, it } from 'vitest'
import { MAGIC } from '../../../protocol/membership'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { overlayLookupService, overlayTopic, viewFromItems } from './overlay'

const ISSUER = `02${'ab'.repeat(32)}`
const MEMBER = `03${'cd'.repeat(32)}`
const MEMBERSHIP_ID = 'a'.repeat(32)

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('https://example.com')).toBe('tm_anytx')
  })

  it('does not invent a custom topic on localhost', () => {
    expect(overlayTopic('http://localhost:5181')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://[::1]:8080')).toBe('tm_anytx')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only this membership and the hinted member key', () => {
    const defTx = '11'.repeat(32)
    const keyTx = '22'.repeat(32)
    const otherTx = '33'.repeat(32)
    const view = viewFromItems([
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'def',
          membershipId: MEMBERSHIP_ID,
          name: 'Gym month',
          durationSec: 30 * 86_400,
          priceSats: 50_000,
          issuerIdentity: ISSUER,
          createdAt: '2026-09-01T12:00:00Z'
        },
        txid: defTx,
        outputIndex: 0
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'key',
          membershipId: MEMBERSHIP_ID,
          memberIdentity: MEMBER,
          issuedAt: '2026-09-01T12:00:00Z',
          durationSec: 60,
          expiresAt: '2026-09-01T12:01:00Z',
          issuerIdentity: ISSUER
        },
        txid: keyTx,
        outputIndex: 1
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'key',
          membershipId: 'b'.repeat(32),
          memberIdentity: MEMBER,
          issuedAt: '2026-09-01T12:00:00Z',
          durationSec: 60,
          expiresAt: '2026-09-01T12:01:00Z',
          issuerIdentity: ISSUER
        },
        txid: otherTx,
        outputIndex: 0
      }
    ], MEMBERSHIP_ID, keyTx)

    expect(view.membership?.name).toBe('Gym month')
    expect(view.key?.txid).toBe(keyTx)
    expect(view.keys).toHaveLength(1)
  })
})
