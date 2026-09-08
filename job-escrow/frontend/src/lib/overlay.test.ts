import { describe, expect, it } from 'vitest'
import { MAGIC } from '../../../protocol/jobescrow'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { overlayLookupService, overlayTopic, viewFromItems } from './overlay'

const CLIENT = `02${'ab'.repeat(32)}`
const PROVIDER = `03${'cd'.repeat(32)}`
const JOB_ID = 'a'.repeat(32)
const HASH = 'b'.repeat(64)

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('https://example.com')).toBe('tm_anytx')
  })

  it('does not invent a custom topic on localhost', () => {
    expect(overlayTopic('http://localhost:5182')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://[::1]:8080')).toBe('tm_anytx')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only this job’s fund and later records', () => {
    const fundTx = '11'.repeat(32)
    const submitTx = '22'.repeat(32)
    const otherTx = '33'.repeat(32)
    const view = viewFromItems([
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'fund',
          jobId: JOB_ID,
          label: 'Shop repair',
          providerName: 'Ada',
          providerIdentity: PROVIDER,
          amountSats: 100_000,
          clientIdentity: CLIENT,
          createdAt: '2026-09-01T12:00:00Z'
        },
        txid: fundTx,
        outputIndex: 0
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'submit',
          jobId: JOB_ID,
          deliverableHash: HASH,
          providerIdentity: PROVIDER,
          submittedAt: '2026-09-01T13:00:00Z'
        },
        txid: submitTx,
        outputIndex: 0
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'fund',
          jobId: 'b'.repeat(32),
          label: 'Other',
          providerName: 'Bea',
          providerIdentity: PROVIDER,
          amountSats: 1,
          clientIdentity: CLIENT,
          createdAt: '2026-09-01T12:00:00Z'
        },
        txid: otherTx,
        outputIndex: 0
      }
    ], JOB_ID)

    expect(view.fund?.label).toBe('Shop repair')
    expect(view.submit?.deliverableHash).toBe(HASH)
    expect(view.status).toBe('submitted')
    expect(view.fund?.txid).toBe(fundTx)
  })
})
