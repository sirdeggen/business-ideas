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

  it('receipt first-load timeout offers Retry, not Loading and not Open form', () => {
    const timedOut = streamPageState(null, OVERLAY_LOOKUP_FAILED)
    expect(timedOut.loading).toBe(false)
    expect(timedOut.offerOpen).toBe(false)
    expect(timedOut.offerRetry).toBe(true)
    expect(timedOut.keepBoard).toBe(false)
    expect(timedOut.message).toBe('Can’t reach overlay. Retry')
    expect(timedOut.message).not.toBe(LOADING_STREAM)
    expect(timedOut.message).not.toBe('Loading stream…')
    expect(timedOut.message).not.toContain('tm_anytx')
    expect(timedOut.message).not.toContain('STEAK')
    expect(timedOut.message?.toLowerCase()).not.toContain('docker')
  })

  it('keeps a prior lookup board when a later overlay timeout fires', () => {
    const kept = streamPageState({ streamId: STREAM_ID }, OVERLAY_LOOKUP_FAILED)
    expect(kept.keepBoard).toBe(true)
    expect(kept.loading).toBe(false)
    expect(kept.offerOpen).toBe(false)
    expect(kept.offerRetry).toBe(true)
  })

  it('a found stream is ready, not Loading', () => {
    const ready = streamPageState({ streamId: STREAM_ID }, null)
    expect(ready.loading).toBe(false)
    expect(ready.offerOpen).toBe(false)
    expect(ready.keepBoard).toBe(true)
  })

  it('first paint may say this takes a moment, then a person gets Retry', () => {
    const loading = streamPageState(null, null)
    expect(loading.loading).toBe(true)
    expect(loading.message).toBe('This takes a moment.')
    expect(loading.offerOpen).toBe(false)
    const timedOut = streamPageState(null, OVERLAY_LOOKUP_FAILED)
    expect(timedOut.loading).toBe(false)
    expect(timedOut.offerRetry).toBe(true)
    expect(timedOut.offerOpen).toBe(false)
  })
})
