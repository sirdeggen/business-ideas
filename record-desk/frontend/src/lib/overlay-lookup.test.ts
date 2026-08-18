import { afterEach, describe, expect, it, vi } from 'vitest'
import { PUBLIC_OVERLAY_URL } from './config'
import { inspectLookupRecords } from './overlay'

describe('public overlay lookup', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('POSTs /lookup to ls_anytx without a wallet client', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'output-list', outputs: [] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const inspection = await inspectLookupRecords(PUBLIC_OVERLAY_URL)

    expect(inspection.rows).toEqual([])
    expect(fetchMock).toHaveBeenCalled()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://overlay-us-1.bsvb.tech/lookup')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'content-type': 'application/json' })
    const body = JSON.parse(String(init.body)) as { service: string, query: { limit: number } }
    expect(body.service).toBe('ls_anytx')
    expect(body.query.limit).toBe(100)
  })
})
