import { afterEach, describe, expect, it, vi } from 'vitest'
import { pingOverlay } from './overlay'

describe('pingOverlay', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('treats /health/live success as reachable even when /version throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/health/live')) return { ok: true } as Response
      throw new Error('Failed to fetch')
    }))
    expect(await pingOverlay('https://overlay-us-1.bsvb.tech')).toBe(true)
  })

  it('does not call a failed /version throw the whole ping offline before health', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/health/live')) return { ok: true } as Response
      throw new Error('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)
    await pingOverlay('https://overlay-us-1.bsvb.tech')
    const paths = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(paths.some((path) => path.endsWith('/health/live'))).toBe(true)
    expect(paths.some((path) => path.endsWith('/version'))).toBe(false)
  })
})
