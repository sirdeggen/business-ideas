import { describe, expect, it } from 'vitest'
import { facilityHref, parseFacilityLocation } from './route'

const FACILITY_ID = 'ab'.repeat(16)
const HINT_TX = 'cd'.repeat(32)

describe('credit deep links', () => {
  it('reads ?c= and optional ?tx=', () => {
    expect(parseFacilityLocation(`?c=${FACILITY_ID}&tx=${HINT_TX}`)).toEqual({
      facilityId: FACILITY_ID,
      hintTxid: HINT_TX
    })
    expect(parseFacilityLocation(`?c=${FACILITY_ID}`)).toEqual({
      facilityId: FACILITY_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /c/:id', () => {
    const href = facilityHref(FACILITY_ID, HINT_TX)
    expect(href).toContain(`?c=${FACILITY_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/c/')
    expect(href).not.toMatch(/\/c\/[0-9a-f]{32}/)
  })

  it('does not treat a path /c/:id as a facility id', () => {
    expect(parseFacilityLocation('', `#/c/${FACILITY_ID}`)).toEqual({
      facilityId: null,
      hintTxid: null
    })
  })

  it('reads hash ?c= after a Pages 404 redirect', () => {
    expect(parseFacilityLocation('', `#/?c=${FACILITY_ID}&tx=${HINT_TX}`)).toEqual({
      facilityId: FACILITY_ID,
      hintTxid: HINT_TX
    })
  })
})
