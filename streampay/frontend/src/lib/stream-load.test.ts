import { describe, expect, it } from 'vitest'
import { OVERLAY_LOOKUP_FAILED } from './config'
import {
  LOADING_STREAM,
  routeNeedsStreamLookup,
  streamPageState
} from './stream-load'

const STREAM_ID = 'ab'.repeat(16)
const CREATE_TX = 'cd'.repeat(32)

describe('stranger-path stream load', () => {
  it('bare /streampay/ never needs a stream lookup', () => {
    expect(routeNeedsStreamLookup('/business-ideas/streampay/', '', '')).toBe(false)
    expect(routeNeedsStreamLookup('/business-ideas/streampay/', '?', '')).toBe(false)
    expect(routeNeedsStreamLookup('/streampay/', '', '')).toBe(false)
  })

  it('receipt ?s=&tx= still looks the stream up', () => {
    expect(routeNeedsStreamLookup(
      '/business-ideas/streampay/',
      `?s=${STREAM_ID}&tx=${CREATE_TX}`,
      ''
    )).toBe(true)
  })

  it('timeout or failed lookup leaves Loading and offers Open a stream', () => {
    const timedOut = streamPageState(null, OVERLAY_LOOKUP_FAILED)
    expect(timedOut.loading).toBe(false)
    expect(timedOut.offerOpen).toBe(true)
    expect(timedOut.message).toBe('Couldn’t load this stream.')
    expect(timedOut.message).not.toBe(LOADING_STREAM)
    expect(timedOut.message).not.toContain('tm_anytx')
    expect(timedOut.message).not.toContain('STEAK')
    expect(timedOut.message?.toLowerCase()).not.toContain('docker')

    const missing = streamPageState(null, 'This stream wasn’t found.')
    expect(missing.loading).toBe(false)
    expect(missing.offerOpen).toBe(true)
  })

  it('a found stream is ready, not Loading', () => {
    const ready = streamPageState({ streamId: STREAM_ID }, null)
    expect(ready.loading).toBe(false)
    expect(ready.offerOpen).toBe(false)
  })

  it('loading copy is a human wait, then timeout offers Open', () => {
    const loading = streamPageState(null, null)
    expect(loading.loading).toBe(true)
    expect(loading.message).toBe('This takes a moment.')
    expect(loading.offerOpen).toBe(false)
    const timedOut = streamPageState(null, OVERLAY_LOOKUP_FAILED)
    expect(timedOut.offerOpen).toBe(true)
    expect(timedOut.message).not.toBe(LOADING_STREAM)
  })
})
