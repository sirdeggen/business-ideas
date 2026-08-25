import { describe, expect, it } from 'vitest'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { clientFilterIgnoresForeignMagic, overlayLookupService, overlayTopic, usesPublicAnytx } from './overlay'
import { MAGIC, type SessionPayload } from './protocol'

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host', () => {
    expect(usesPublicAnytx(PUBLIC_OVERLAY_URL)).toBe(true)
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
  })
})

describe('MAGIC / client-side filter ignores other protocols', () => {
  it('drops invoices and raffle payloads from an anytx list', () => {
    const session: SessionPayload = {
      magic: MAGIC,
      version: '1',
      kind: 'approval',
      sessionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      approverIdentity: '02' + 'ab'.repeat(32),
      timestamp: '2026-08-25T00:00:00.000Z'
    }
    const kept = clientFilterIgnoresForeignMagic([
      { payload: { ...session, magic: 'bsvinvoice' as typeof MAGIC }, txid: '1', outputIndex: 0 },
      { payload: session, txid: '2', outputIndex: 0 }
    ])
    expect(kept).toHaveLength(1)
    expect(kept[0].txid).toBe('2')
  })
})
