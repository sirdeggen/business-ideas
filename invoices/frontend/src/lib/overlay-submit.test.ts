import { afterEach, describe, expect, it, vi } from 'vitest'
import { HTTPSOverlayBroadcastFacilitator, Transaction } from '@bsv/sdk'
import { PUBLIC_OVERLAY_URL, errorMessage } from './config'
import { steakOutputsToAdmit, submitInvoiceTx } from './overlay'

describe('steakOutputsToAdmit', () => {
  it('reads tm_anytx.outputsToAdmit as success', () => {
    expect(steakOutputsToAdmit({
      tm_anytx: { outputsToAdmit: [0], coinsToRetain: [] }
    }, 'tm_anytx')).toEqual([0])
  })

  it('treats a missing or empty admit list as failure', () => {
    expect(steakOutputsToAdmit({ tm_anytx: { outputsToAdmit: [] } }, 'tm_anytx')).toEqual([])
    expect(steakOutputsToAdmit({ tm_anytx: {} }, 'tm_anytx')).toBeNull()
    expect(steakOutputsToAdmit({}, 'tm_anytx')).toBeNull()
  })
})

describe('submitInvoiceTx', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function stubWalletBeef(): void {
    vi.spyOn(Transaction, 'fromAtomicBEEF').mockReturnValue({
      toBEEF: () => [1, 2, 3]
    } as unknown as Transaction)
  }

  it('admits when the facilitator returns tm_anytx.outputsToAdmit on overlay-us-1', async () => {
    stubWalletBeef()
    const send = vi.spyOn(HTTPSOverlayBroadcastFacilitator.prototype, 'send').mockResolvedValue({
      tm_anytx: { outputsToAdmit: [0], coinsToRetain: [] }
    })

    const result = await submitInvoiceTx(PUBLIC_OVERLAY_URL, [9, 9, 9])

    expect(result.admitted).toEqual([0])
    expect(send).toHaveBeenCalledWith(PUBLIC_OVERLAY_URL, {
      beef: [1, 2, 3],
      topics: ['tm_anytx']
    })
  })

  it('falls back to POST /submit with x-topics tm_anytx when the facilitator fails', async () => {
    stubWalletBeef()
    vi.spyOn(HTTPSOverlayBroadcastFacilitator.prototype, 'send').mockRejectedValue(new Error('Failed to facilitate broadcast'))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ tm_anytx: { outputsToAdmit: [0] } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitInvoiceTx('https://overlay-us-1.bsvb.tech/', [9, 9, 9])

    expect(result.admitted).toEqual([0])
    expect(fetchMock).toHaveBeenCalledWith('https://overlay-us-1.bsvb.tech/submit', expect.objectContaining({
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-topics': JSON.stringify(['tm_anytx'])
      }
    }))
  })

  it('keeps localhost Docker on tm_invoices', async () => {
    stubWalletBeef()
    vi.spyOn(HTTPSOverlayBroadcastFacilitator.prototype, 'send').mockRejectedValue(new Error('offline'))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ tm_invoices: { outputsToAdmit: [0] } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitInvoiceTx('http://localhost:8081', [9, 9, 9])

    expect(result.admitted).toEqual([0])
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8081/submit', expect.objectContaining({
      headers: expect.objectContaining({
        'x-topics': JSON.stringify(['tm_invoices'])
      })
    }))
  })

  it('throws a generic error when HTTP/STEAK fails, never host jargon', async () => {
    stubWalletBeef()
    vi.spyOn(HTTPSOverlayBroadcastFacilitator.prototype, 'send').mockRejectedValue(new Error('Failed to facilitate broadcast'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'All local topical hosts have rejected the transaction.'
    }))

    await expect(submitInvoiceTx(PUBLIC_OVERLAY_URL, [9, 9, 9])).rejects.toThrow('overlay submit failed')
    const mapped = errorMessage(new Error('overlay submit failed'))
    expect(mapped).toBe('Couldn’t send this invoice. Try again in a moment.')
    expect(mapped).not.toContain('tm_anytx')
    expect(mapped.toLowerCase()).not.toContain('declined')
  })
})
