import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAGIC } from '../../../protocol/record'
import { inspectHeldRecords } from './actions'
import { isListOutputsFailure, isWalletMissingMessage } from './config'
import { loadRecordsList } from './list'
import type { OverlayRecord } from './overlay'

const OVERLAY_URL = 'https://overlay-us-1.bsvb.tech'
const WALLET_MISSING =
  'listOutputs(records, include=locking scripts) failed: No wallet available over any communication substrate. Install a BSV wallet today!'

function record(partial: Partial<OverlayRecord> = {}): OverlayRecord {
  return {
    magic: MAGIC,
    schemaVersion: '1',
    hash: 'ab'.repeat(32),
    name: 'Alex',
    kind: 'note',
    note: 'Gate lock checked at dusk.',
    time: '2026-08-18T16:00:00Z',
    lat: '',
    lon: '',
    txid: 'cd'.repeat(32),
    outputIndex: 0,
    ...partial
  }
}

describe('Buy-a-dump overlay-first read', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads overlay rows with no wallet and does not call listOutputs', async () => {
    const overlayRow = record({ name: 'Urs', kind: 'inspection' })
    const inspectHeld = vi.fn(async () => {
      throw new Error(WALLET_MISSING)
    })
    const inspectLookup = vi.fn(async () => ({
      rows: [overlayRow],
      listed: 1,
      parsed: 1,
      unparsed: []
    }))
    const result = await loadRecordsList(OVERLAY_URL, null, [], {
      inspectLookup,
      inspectHeld
    })
    expect(inspectLookup).toHaveBeenCalledWith(OVERLAY_URL)
    expect(inspectHeld).not.toHaveBeenCalled()
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].name).toBe('Urs')
    expect(result.rows[0].kind).toBe('inspection')
    expect(result.rows[0].hash).toBe(overlayRow.hash)
    expect(result.error).toBeNull()
    expect(result.error ?? '').not.toMatch(/no wallet available/i)
  })

  it('keeps remembered rows when overlay is empty and there is no wallet', async () => {
    const remembered = record({ name: 'Alex' })
    const inspectHeld = vi.fn(async () => {
      throw new Error(WALLET_MISSING)
    })
    const result = await loadRecordsList(OVERLAY_URL, undefined, [remembered], {
      inspectLookup: async () => ({ rows: [], listed: 0, parsed: 0, unparsed: [] }),
      inspectHeld
    })
    expect(inspectHeld).not.toHaveBeenCalled()
    expect(result.rows.map((row) => row.name)).toEqual(['Alex'])
    expect(result.error).toBeNull()
  })

  it('does not let a listOutputs failure become the list error or clear overlay rows', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const overlayRow = record({ name: 'Urs' })
    const inspectHeld = vi.fn(async () => {
      throw new Error(WALLET_MISSING)
    })
    const result = await loadRecordsList(OVERLAY_URL, { connected: true }, [], {
      inspectLookup: async () => ({
        rows: [overlayRow],
        listed: 1,
        parsed: 1,
        unparsed: []
      }),
      inspectHeld
    })
    expect(inspectHeld).toHaveBeenCalledOnce()
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].name).toBe('Urs')
    expect(result.error).toBeNull()
    expect(result.error ?? '').not.toMatch(/listOutputs/)
    expect(result.error ?? '').not.toMatch(/No wallet available/)
  })

  it('still shows a real overlay lookup failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await loadRecordsList(OVERLAY_URL, null, [record()], {
      inspectLookup: async () => {
        throw new Error('GET /lookup failed: 502')
      },
      inspectHeld: vi.fn(async () => {
        throw new Error(WALLET_MISSING)
      })
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].name).toBe('Alex')
    expect(result.error).toMatch(/GET \/lookup failed: 502/)
    expect(result.error).not.toMatch(/No wallet available/)
  })

  it('inspectHeldRecords without a wallet does not listOutputs', async () => {
    expect(isWalletMissingMessage(WALLET_MISSING)).toBe(true)
    expect(isListOutputsFailure(WALLET_MISSING)).toBe(true)
    const inspection = await inspectHeldRecords(null)
    expect(inspection.held).toEqual([])
  })
})
