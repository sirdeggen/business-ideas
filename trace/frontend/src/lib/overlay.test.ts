import { describe, expect, it } from 'vitest'
import { FEE_SATS, MAGIC, SCHEMA_VERSION, type TraceReceipt } from '../../../protocol/trace'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import {
  clientFilterIgnoresForeignMagic,
  overlayLookupService,
  overlayTopic,
  usesPublicAnytx,
  type OverlayItem
} from './overlay'

function item(magic: string, txid: string): OverlayItem {
  const payload: TraceReceipt = {
    magic: magic as typeof MAGIC,
    version: SCHEMA_VERSION,
    kind: 'register',
    token: 'a1b2c3d4e5f67890',
    what: 'Dawn lot 12',
    who: 'Harbor Co.',
    rights: 'own',
    feePaid: FEE_SATS,
    timestamp: '2026-09-08T12:00:00Z'
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
    expect(overlayTopic('http://localhost:5180')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:5180')).toBe('ls_anytx')
    expect(overlayTopic('http://[::1]:5180')).toBe('tm_anytx')
    expect(overlayTopic('http://localhost:5180')).not.toBe('tm_trace')
    expect(overlayLookupService('http://localhost:5180')).not.toBe('ls_trace')
  })
})

describe('MAGIC / client-side filter ignores other protocols', () => {
  it('drops datasets, signed records, titles, and name leases from an anytx list', () => {
    const kept = clientFilterIgnoresForeignMagic([
      item('dataset', '1'),
      item('record', '2'),
      item('title', '3'),
      item('namelease', '4'),
      item(MAGIC, '5')
    ])
    expect(kept).toHaveLength(1)
    expect(kept[0].txid).toBe('5')
    expect(kept[0].payload.magic).toBe('trace')
  })
})
