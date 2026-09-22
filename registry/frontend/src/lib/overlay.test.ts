import { describe, expect, it } from 'vitest'
import { MAGIC, TRANSFER_FEE_SATS } from '../../../protocol/registry'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { overlayLookupService, overlayTopic, viewFromItems } from './overlay'

const ADMIN = `02${'ab'.repeat(32)}`
const HOLDER = `03${'cd'.repeat(32)}`
const OTHER = `02${'ef'.repeat(32)}`
const REGISTER_ID = 'a'.repeat(32)

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('https://example.com')).toBe('tm_anytx')
  })

  it('does not invent a custom topic on localhost', () => {
    expect(overlayTopic('http://localhost:5184')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://[::1]:8080')).toBe('tm_anytx')
  })
})

describe('client MAGIC filter', () => {
  it('folds one register’s issues and paid transfers', () => {
    const view = viewFromItems([
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'register',
          registerId: REGISTER_ID,
          name: 'HOA unit ledger',
          unitLabel: 'units',
          totalUnits: 100,
          aumNote: '',
          admin: ADMIN,
          createdAt: '2026-09-22T12:00:00Z'
        },
        txid: '11'.repeat(32),
        outputIndex: 0
      },
      {
        payload: {
          magic: 'kya',
          version: '1',
          kind: 'register',
          registerId: REGISTER_ID,
          name: 'Other desk',
          unitLabel: 'units',
          totalUnits: null,
          aumNote: '',
          admin: ADMIN,
          createdAt: '2026-09-22T11:00:00Z'
        },
        txid: '22'.repeat(32),
        outputIndex: 0
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'issue',
          registerId: REGISTER_ID,
          issueId: 'aa'.repeat(32),
          holder: HOLDER,
          units: 40,
          admin: ADMIN,
          issuedAt: '2026-09-22T13:00:00Z'
        },
        txid: '33'.repeat(32),
        outputIndex: 1
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'transfer',
          registerId: REGISTER_ID,
          transferId: 'bb'.repeat(32),
          from: HOLDER,
          to: OTHER,
          units: 10,
          feeSats: TRANSFER_FEE_SATS,
          protocolFeeSats: TRANSFER_FEE_SATS,
          actor: HOLDER,
          transferredAt: '2026-09-22T14:00:00Z'
        },
        txid: '44'.repeat(32),
        outputIndex: 1
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'issue',
          registerId: 'b'.repeat(32),
          issueId: 'cc'.repeat(32),
          holder: HOLDER,
          units: 9,
          admin: ADMIN,
          issuedAt: '2026-09-22T13:00:00Z'
        },
        txid: '55'.repeat(32),
        outputIndex: 0
      }
    ], REGISTER_ID)

    expect(view.register?.name).toBe('HOA unit ledger')
    expect(view.issues).toHaveLength(1)
    expect(view.transfers).toHaveLength(1)
    expect(view.fold.holdings).toEqual([
      { holder: HOLDER, units: 30 },
      { holder: OTHER, units: 10 }
    ])
  })
})
