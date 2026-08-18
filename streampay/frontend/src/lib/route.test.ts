import { describe, expect, it } from 'vitest'
import { parseStreamLocation, streamHref } from './route'

const STREAM_ID = 'ab'.repeat(16)
const CREATE_TX = 'cd'.repeat(32)

describe('stream shareable route', () => {
  it('emits BASE_URL + ?s=<32hex> (and &tx= if present)', () => {
    const base = import.meta.env.BASE_URL || '/'
    const normalized = base.endsWith('/') ? base : `${base}/`
    expect(streamHref(STREAM_ID)).toBe(`${normalized}?s=${STREAM_ID}`)
    expect(streamHref(STREAM_ID, CREATE_TX)).toBe(`${normalized}?s=${STREAM_ID}&tx=${CREATE_TX}`)
  })

  it('reads /s/<streamId> without a create txid', () => {
    expect(parseStreamLocation(`/business-ideas/streampay/s/${STREAM_ID}`, '', '')).toEqual({
      streamId: STREAM_ID,
      createTxid: null
    })
  })

  it('reads optional ?tx= for ls_anytx lookup', () => {
    expect(parseStreamLocation(
      `/business-ideas/streampay/s/${STREAM_ID}`,
      `?tx=${CREATE_TX}`,
      ''
    )).toEqual({
      streamId: STREAM_ID,
      createTxid: CREATE_TX
    })
  })

  it('reads ?s=<streamId> on the StreamPay index', () => {
    expect(parseStreamLocation(
      '/business-ideas/streampay/',
      `?s=${STREAM_ID}`,
      ''
    )).toEqual({
      streamId: STREAM_ID,
      createTxid: null
    })
    expect(parseStreamLocation(
      '/business-ideas/streampay/',
      `?s=${STREAM_ID}&tx=${CREATE_TX}`,
      ''
    )).toEqual({
      streamId: STREAM_ID,
      createTxid: CREATE_TX
    })
  })

  it('reads hash #/s/<id>?tx= after a Pages 404 redirect', () => {
    expect(parseStreamLocation(
      '/business-ideas/streampay/',
      '',
      `#/s/${STREAM_ID}?tx=${CREATE_TX}`
    )).toEqual({
      streamId: STREAM_ID,
      createTxid: CREATE_TX
    })
  })
})
