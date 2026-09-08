import { describe, expect, it } from 'vitest'
import { jobHref, parseJobLocation } from './route'

const JOB_ID = 'ab'.repeat(16)
const FUND_TX = 'cd'.repeat(32)

describe('job deep links', () => {
  it('reads ?j= and optional ?tx=', () => {
    expect(parseJobLocation(`?j=${JOB_ID}&tx=${FUND_TX}`)).toEqual({
      jobId: JOB_ID,
      fundTxid: FUND_TX
    })
    expect(parseJobLocation(`?j=${JOB_ID}`)).toEqual({
      jobId: JOB_ID,
      fundTxid: null
    })
  })

  it('builds query-param links, never /j/:id', () => {
    const href = jobHref(JOB_ID, FUND_TX)
    expect(href).toContain(`?j=${JOB_ID}`)
    expect(href).toContain(`tx=${FUND_TX}`)
    expect(href).not.toContain('/j/')
    expect(href).not.toMatch(/\/j\/[0-9a-f]{32}/)
  })

  it('does not treat a path /j/:id as a job id', () => {
    expect(parseJobLocation('', `#/j/${JOB_ID}`)).toEqual({
      jobId: null,
      fundTxid: null
    })
  })

  it('reads hash ?j= after a Pages 404 redirect', () => {
    expect(parseJobLocation('', `#/?j=${JOB_ID}&tx=${FUND_TX}`)).toEqual({
      jobId: JOB_ID,
      fundTxid: FUND_TX
    })
  })
})
