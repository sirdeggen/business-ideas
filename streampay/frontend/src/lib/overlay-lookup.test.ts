import { afterEach, describe, expect, it, vi } from 'vitest'
import { OVERLAY_LOOKUP_FAILED } from './config'
import { LOOKUP_DEADLINE_MS, queryOverlayStreams, type OverlayStream } from './overlay'

const STREAM_ID = 'ab'.repeat(16)
const CREATE_TX = 'cd'.repeat(32)

function streamRow(): OverlayStream {
  return { streamId: STREAM_ID } as OverlayStream
}

describe('queryOverlayStreams', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns immediately when the txid query already found the stream', async () => {
    const fetchAnswer = vi.fn(async (body: { txid?: string }) => {
      if (body.txid) return { type: 'output-list' as const, outputs: [{ txid: body.txid, beef: [], outputIndex: 0 }] }
      throw new Error('must not page recent rows after a txid hit')
    })
    const decode = vi.fn(() => [streamRow()])

    const rows = await queryOverlayStreams(
      { streamId: STREAM_ID, txid: CREATE_TX },
      fetchAnswer,
      decode,
      { deadlineMs: LOOKUP_DEADLINE_MS }
    )

    expect(rows[0]?.streamId).toBe(STREAM_ID)
    expect(fetchAnswer).toHaveBeenCalledTimes(1)
    expect(fetchAnswer.mock.calls[0]?.[0]).toEqual({ txid: CREATE_TX })
  })

  it('pages recent rows only when the txid query did not find the stream', async () => {
    const fetchAnswer = vi.fn(async (body: { txid?: string, limit?: number }) => {
      if (body.txid) return { type: 'output-list' as const, outputs: [] }
      return { type: 'output-list' as const, outputs: [{ txid: CREATE_TX, beef: [], outputIndex: 0 }] }
    })
    const decode = vi.fn((answers: { type: string, outputs: unknown[] }[]) => {
      const last = answers[answers.length - 1]
      return last && last.outputs.length > 0 ? [streamRow()] : []
    })

    const rows = await queryOverlayStreams(
      { streamId: STREAM_ID, txid: CREATE_TX },
      fetchAnswer,
      decode
    )

    expect(rows[0]?.streamId).toBe(STREAM_ID)
    expect(fetchAnswer).toHaveBeenCalledTimes(2)
    expect(fetchAnswer.mock.calls[1]?.[0]).toMatchObject({ limit: 100, skip: 0, sortOrder: 'desc' })
  })

  it('rejects a hanging overlay query at the overall deadline', async () => {
    vi.useFakeTimers()
    const pending = queryOverlayStreams(
      { streamId: STREAM_ID, txid: CREATE_TX },
      () => new Promise(() => {}),
      () => [],
      { deadlineMs: 80 }
    )
    const rejected = expect(pending).rejects.toThrow(OVERLAY_LOOKUP_FAILED)
    await vi.advanceTimersByTimeAsync(79)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1)
    await rejected
  })
})
