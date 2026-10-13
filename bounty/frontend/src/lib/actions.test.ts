import { describe, expect, it } from 'vitest'
import { fundPool, releaseTier, submitReport } from '../../../protocol/bounty'
import { assertCanRecord } from './actions'

const ID = 'ab'.repeat(16)
const KEY = `02${'ab'.repeat(32)}`
const TIERS = { critical: 500_000, high: 200_000, medium: 80_000, low: 20_000 }

function released() {
  return releaseTier(submitReport(fundPool({
    projectName: 'Northwind Devices',
    scope: 'Public API and the firmware updater.',
    tiers: TIERS,
    payoutFeeBps: 800,
    submissionFeeSats: 1_000,
    exportFeeSats: 2_500
  }, '2026-10-13T12:00:00Z', ID), {
    researcherName: 'Ada',
    reportBody: 'The updater accepts an unsigned manifest.',
    at: '2026-10-13T12:00:00Z'
  }), 'high', '2026-10-13T15:00:00Z')
}

describe('record gate', () => {
  it('requires a researcher key once a tier is released', () => {
    expect(() => assertCanRecord(released(), '')).toThrow(/researcher key/)
    expect(() => assertCanRecord(released(), KEY)).not.toThrow()
  })

  it('can record a funded pool before any verdict', () => {
    const desk = fundPool({
      projectName: 'Northwind Devices',
      scope: 'Public API and the firmware updater.',
      tiers: TIERS,
      payoutFeeBps: 800,
      submissionFeeSats: 1_000,
      exportFeeSats: 2_500
    }, '2026-10-13T12:00:00Z', ID)
    expect(() => assertCanRecord(desk, '')).not.toThrow()
  })
})
