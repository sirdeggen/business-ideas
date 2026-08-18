import { afterEach, describe, expect, it, vi } from 'vitest'
import { HTTPSOverlayBroadcastFacilitator, Transaction } from '@bsv/sdk'
import { PUBLIC_OVERLAY_URL } from './config'
import { submitRecordTx } from './overlay'

describe('submitRecordTx', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function stubWalletBeef(): void {
    const tx = {
      broadcast: vi.fn().mockRejectedValue(new Error('Failed to facilitate broadcast')),
      toBEEF: () => [1, 2, 3],
      outputs: []
    }
    vi.spyOn(Transaction, 'fromAtomicBEEF').mockReturnValue(tx as unknown as Transaction)
    vi.spyOn(Transaction, 'fromBEEF').mockReturnValue(tx as unknown as Transaction)
  }

  it('falls back to POST /submit with x-topics tm_anytx when the facilitator fails', async () => {
    stubWalletBeef()
    vi.spyOn(HTTPSOverlayBroadcastFacilitator.prototype, 'send').mockRejectedValue(new Error('Failed to facilitate broadcast'))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ tm_anytx: { outputsToAdmit: [0] } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitRecordTx('https://overlay-us-1.bsvb.tech/', [9, 9, 9])

    expect(result.topic).toBe('tm_anytx')
    expect(result.host).toBe('https://overlay-us-1.bsvb.tech')
    expect(fetchMock).toHaveBeenCalledWith('https://overlay-us-1.bsvb.tech/submit', expect.objectContaining({
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-topics': JSON.stringify(['tm_anytx'])
      }
    }))
  })

  it('keeps localhost Docker on tm_records', async () => {
    stubWalletBeef()
    vi.spyOn(HTTPSOverlayBroadcastFacilitator.prototype, 'send').mockRejectedValue(new Error('offline'))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ tm_records: { outputsToAdmit: [0] } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await submitRecordTx('http://localhost:8083', [9, 9, 9])

    expect(result.topic).toBe('tm_records')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8083/submit', expect.objectContaining({
      headers: expect.objectContaining({
        'x-topics': JSON.stringify(['tm_records'])
      })
    }))
  })

  it('surfaces the overlay error instead of a generic hint', async () => {
    stubWalletBeef()
    vi.spyOn(HTTPSOverlayBroadcastFacilitator.prototype, 'send').mockRejectedValue(new Error('Failed to facilitate broadcast'))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'All local topical hosts have rejected the transaction.'
    }))

    await expect(submitRecordTx(PUBLIC_OVERLAY_URL, [9, 9, 9])).rejects.toThrow(/tm_anytx/)
    await expect(submitRecordTx(PUBLIC_OVERLAY_URL, [9, 9, 9])).rejects.toThrow(/500/)
  })
})
