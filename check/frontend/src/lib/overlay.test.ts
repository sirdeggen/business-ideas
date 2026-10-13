import { describe, expect, it } from 'vitest'
import { MAGIC, SEED_FLAGS, runCheck } from '../../../protocol/check'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { flagsFromItems, overlayLookupService, overlayTopic, receiptsFromItems, type OverlayItem } from './overlay'

const ID = 'ab'.repeat(16)

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host and on localhost', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('http://localhost:5188')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://localhost:5188')).not.toBe('tm_check')
    expect(overlayLookupService('http://localhost:5188')).not.toBe('ls_check')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only check flags and receipts on the public book', () => {
    const receipt = runCheck({
      payee: 'known.vendor.demo@example.invalid',
      amountSats: 10,
      payerRef: 'PO-1',
      priorPayees: ['known.vendor.demo@example.invalid'],
      flags: []
    }, '2026-10-13T16:00:00Z', ID)
    const foreign = {
      payload: { ...SEED_FLAGS[0], magic: 'scrip' },
      txid: '11'.repeat(32),
      outputIndex: 0
    } as unknown as OverlayItem
    const items: OverlayItem[] = [
      { payload: SEED_FLAGS[0], txid: 'aa'.repeat(32), outputIndex: 0 },
      foreign,
      { payload: receipt, txid: 'bb'.repeat(32), outputIndex: 0 }
    ]
    expect(items[0]?.payload.magic).toBe(MAGIC)
    expect(flagsFromItems(items).map((row) => row.flagId)).toEqual([SEED_FLAGS[0].flagId])
    expect(receiptsFromItems(items).map((row) => row.checkId)).toEqual([ID])
    expect(flagsFromItems([foreign])).toEqual([])
  })
})
