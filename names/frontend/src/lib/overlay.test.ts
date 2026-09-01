import { describe, expect, it } from 'vitest'
import { MAGIC, SCHEMA_VERSION, type NameLease } from '../../../protocol/namelease'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import {
  clientFilterIgnoresForeignMagic,
  overlayLookupService,
  overlayTopic,
  usesPublicAnytx,
  type OverlayItem
} from './overlay'

function item(magic: string, txid: string): OverlayItem {
  const payload: NameLease = {
    magic: magic as typeof MAGIC,
    version: SCHEMA_VERSION,
    kind: 'register',
    name: 'alice',
    lessee: `02${'ab'.repeat(32)}`,
    registeredAt: '2026-08-01T00:00:00Z',
    expiresAt: '2026-08-31T00:00:00Z',
    periodDays: 30,
    amountSats: 1200
  }
  return { payload, txid, outputIndex: 1 }
}

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public overlay', () => {
    expect(usesPublicAnytx(PUBLIC_OVERLAY_URL)).toBe(true)
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
  })

  it('does not invent a custom topic on localhost', () => {
    expect(overlayTopic('http://localhost:5178')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:5178')).toBe('ls_anytx')
    expect(overlayTopic('http://[::1]:5178')).toBe('tm_anytx')
    expect(overlayTopic('http://localhost:5178')).not.toBe('tm_namelease')
    expect(overlayLookupService('http://localhost:5178')).not.toBe('ls_namelease')
  })
})

describe('MAGIC / client-side filter ignores other protocols', () => {
  it('drops invoices, session, spend-policy, and dataset payloads from an anytx list', () => {
    const kept = clientFilterIgnoresForeignMagic([
      item('bsvinvoice', '1'),
      item('session ap', '2'),
      item('spendpolicy', '3'),
      item('dataset', '4'),
      item(MAGIC, '5')
    ])
    expect(kept).toHaveLength(1)
    expect(kept[0].txid).toBe('5')
    expect(kept[0].payload.magic).toBe('namelease')
  })
})
