import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAGIC } from '../../../protocol/receivable'
import { inspectHeldReceivables } from './actions'
import { loadChaseList } from './chase'
import { isListOutputsFailure, isWalletMissingMessage } from './config'
import type { OverlayReceivable } from './overlay'

const OVERLAY_URL = 'https://overlay-us-1.bsvb.tech'
const WALLET_MISSING =
  'listOutputs(receivables, include=locking scripts) failed: No wallet available over any communication substrate. Install a BSV wallet today!'

function invoice(partial: Partial<OverlayReceivable> = {}): OverlayReceivable {
  return {
    magic: MAGIC,
    invoiceId: 'QA-0813-DESK',
    creditor: 'Riverside Hall',
    debtor: 'QA Debtor',
    amountSats: 245,
    dueDate: '2026-09-30',
    status: 'open',
    memo: 'desk qa',
    advanceBps: 0,
    txid: 'aa'.repeat(32),
    outputIndex: 0,
    ...partial
  }
}

describe('Chase overlay-first read', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads overlay rows with no wallet and does not call listOutputs', async () => {
    const overlayRow = invoice({ invoiceId: 'QA-0813-NAMED', debtor: 'QA Debtor' })
    const inspectHeld = vi.fn(async () => {
      throw new Error(WALLET_MISSING)
    })
    const result = await loadChaseList(OVERLAY_URL, null, [], {
      inspectLookup: async () => ({
        rows: [overlayRow],
        listed: 1,
        parsed: 1,
        unparsed: []
      }),
      inspectHeld
    })
    expect(inspectHeld).not.toHaveBeenCalled()
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].invoiceId).toBe('QA-0813-NAMED')
    expect(result.rows[0].debtor).toBe('QA Debtor')
    expect(result.error).toBeNull()
    expect(result.preview).toBe(false)
    expect(result.error ?? '').not.toMatch(/no wallet available/i)
    expect(result.error ?? '').not.toMatch(/Install a BSV/i)
  })

  it('keeps remembered rows when overlay is empty and there is no wallet', async () => {
    const remembered = invoice({ invoiceId: 'QA-0813-DESK', debtor: 'QA Debtor' })
    const inspectHeld = vi.fn(async () => {
      throw new Error(WALLET_MISSING)
    })
    const result = await loadChaseList(OVERLAY_URL, undefined, [remembered], {
      inspectLookup: async () => ({ rows: [], listed: 0, parsed: 0, unparsed: [] }),
      inspectHeld
    })
    expect(inspectHeld).not.toHaveBeenCalled()
    expect(result.rows.map((row) => row.invoiceId)).toEqual(['QA-0813-DESK'])
    expect(result.error).toBeNull()
  })

  it('does not surface a wallet-missing error as the Chase read error', async () => {
    expect(isWalletMissingMessage(WALLET_MISSING)).toBe(true)
    expect(isListOutputsFailure(WALLET_MISSING)).toBe(true)
    const result = await loadChaseList(OVERLAY_URL, null, [], {
      inspectLookup: async () => ({ rows: [invoice()], listed: 1, parsed: 1, unparsed: [] })
    })
    expect(result.error).toBeNull()
    expect(isWalletMissingMessage(result.error ?? '')).toBe(false)
  })

  it('does not let a listOutputs failure become the Chase error or clear overlay rows', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const overlayRow = invoice({ invoiceId: 'QA-0813-NAMED' })
    const inspectHeld = vi.fn(async () => {
      throw new Error(WALLET_MISSING)
    })
    const result = await loadChaseList(OVERLAY_URL, { connected: true }, [], {
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
    expect(result.rows[0].invoiceId).toBe('QA-0813-NAMED')
    expect(result.error).toBeNull()
    expect(result.error ?? '').not.toMatch(/listOutputs/)
    expect(result.error ?? '').not.toMatch(/No wallet available/)
  })

  it('still shows a real overlay lookup failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await loadChaseList(OVERLAY_URL, null, [invoice()], {
      inspectLookup: async () => {
        throw new Error('GET /lookup failed: 502')
      },
      inspectHeld: vi.fn(async () => {
        throw new Error(WALLET_MISSING)
      })
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].invoiceId).toBe('QA-0813-DESK')
    expect(result.error).toMatch(/GET \/lookup failed: 502/)
    expect(result.error).not.toMatch(/No wallet available/)
  })

  it('enriches with held outputs only after a wallet is connected', async () => {
    const overlayRow = invoice({ invoiceId: 'QA-0813-NAMED', amountSats: 1, debtor: '02' + 'ab'.repeat(32) })
    const heldItem = invoice({ invoiceId: 'QA-0813-NAMED', amountSats: 245, debtor: 'QA Debtor' })
    const result = await loadChaseList(OVERLAY_URL, { connected: true }, [], {
      inspectLookup: async () => ({
        rows: [overlayRow],
        listed: 1,
        parsed: 1,
        unparsed: []
      }),
      inspectHeld: async () => ({
        held: [{
          outpoint: `${heldItem.txid}.${heldItem.outputIndex}`,
          satoshis: 1,
          item: heldItem,
          customInstructions: ''
        }],
        primary: {
          basket: 'receivables',
          listed: 1,
          totalOutputs: 1,
          spendable: 1,
          parsed: 1,
          unparsed: []
        }
      })
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].debtor).toBe('QA Debtor')
    expect(result.rows[0].amountSats).toBe(245)
    expect(result.held).toHaveLength(1)
    expect(result.error).toBeNull()
  })

  it('inspectHeldReceivables without a wallet does not listOutputs', async () => {
    const inspection = await inspectHeldReceivables(null)
    expect(inspection.held).toEqual([])
    expect(inspection.primary.listed).toBe(0)
    expect(inspection.primary.unparsed).toEqual([])
  })

  it('shows the empty state only when overlay and remembered are truly empty', async () => {
    const result = await loadChaseList(OVERLAY_URL, null, [], {
      inspectLookup: async () => ({ rows: [], listed: 0, parsed: 0, unparsed: [] }),
      inspectHeld: vi.fn(async () => {
        throw new Error(WALLET_MISSING)
      })
    })
    expect(result.rows).toHaveLength(0)
    expect(result.preview).toBe(false)
    expect(result.error).toBeNull()
  })
})
