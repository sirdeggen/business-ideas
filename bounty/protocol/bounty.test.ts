import { describe, expect, it } from 'vitest'
import {
  EXPORT_NOTE,
  MAGIC,
  MAX_PAYOUT_FEE_BPS,
  appendTimeline,
  bookFromRecords,
  deskFromRecords,
  earlierSubmission,
  encodeFundFields,
  encodeSubmitFields,
  encodeTimelineFields,
  encodeVerdictFields,
  exportTimeline,
  formatExport,
  fundPool,
  hashReport,
  keepMagic,
  parseBountyFields,
  payoutFeeSats,
  publicPayloads,
  recordPlan,
  releaseLines,
  releaseTier,
  submitReport,
  type BountySubmit
} from './bounty'

const ID = 'ab'.repeat(16)
const WHEN = '2026-10-13T12:00:00Z'
const BODY = 'The updater accepts an unsigned manifest. SECRET-BUG-BODY'
const TIERS = { critical: 500_000, high: 200_000, medium: 80_000, low: 20_000 }

function funded() {
  return fundPool({
    projectName: 'Northwind Devices',
    scope: 'Public API and the firmware updater.',
    tiers: TIERS,
    payoutFeeBps: 800,
    submissionFeeSats: 1_000,
    exportFeeSats: 2_500
  }, WHEN, ID)
}

function posted(at = WHEN) {
  return submitReport(funded(), {
    researcherName: 'Ada',
    reportBody: BODY,
    at
  })
}

describe('encode and decode', () => {
  it('round-trips fund, submit, verdict, and timeline without the report body', () => {
    const desk = releaseTier(posted(), 'high', '2026-10-13T15:00:00Z')
    const withClock = {
      ...desk,
      timeline: appendTimeline(
        appendTimeline(desk.timeline, 'acknowledged', '2026-10-13T18:00:00Z', ID),
        'fixed',
        '2026-10-14T12:00:00Z',
        ID
      )
    }
    const fund = parseBountyFields(encodeFundFields(withClock.fund!))
    const submit = parseBountyFields(encodeSubmitFields(withClock.submission!))
    const verdict = parseBountyFields(encodeVerdictFields(withClock.verdict!))
    const timeline = withClock.timeline.map((event) => parseBountyFields(encodeTimelineFields(event)))
    expect(fund).toMatchObject({ kind: 'fund', projectName: 'Northwind Devices', poolSats: 800_000 })
    expect(submit).toMatchObject({ kind: 'submit', researcherName: 'Ada', reportHash: hashReport(BODY) })
    expect(verdict).toMatchObject({ kind: 'verdict', tier: 'high', feeSats: 16_000, researcherSats: 184_000 })
    expect(timeline.map((event) => event && event.kind === 'timeline' ? event.stage : null)).toEqual([
      'received',
      'acknowledged',
      'fixed'
    ])
    const encoded = [
      ...encodeFundFields(withClock.fund!),
      ...encodeSubmitFields(withClock.submission!),
      ...encodeVerdictFields(withClock.verdict!),
      ...withClock.timeline.flatMap((event) => encodeTimelineFields(event))
    ].map((field) => new TextDecoder().decode(Uint8Array.from(field))).join('\n')
    expect(encoded).not.toContain('SECRET-BUG-BODY')
    expect(encoded).not.toContain('unsigned manifest')
    expect(JSON.stringify(publicPayloads(withClock))).not.toContain('SECRET-BUG-BODY')
    expect(submit && 'reportBody' in submit).toBe(false)
  })

  it('drops a foreign magic and keeps bounty rows', () => {
    const desk = posted()
    const foreign = { ...desk.submission!, magic: 'jobescrow' }
    const rows = keepMagic([desk.fund!, desk.submission!, foreign as unknown as BountySubmit])
    expect(rows.map((row) => row.kind)).toEqual(['fund', 'submit'])
    expect(rows.every((row) => row.magic === MAGIC)).toBe(true)
    expect(MAGIC).toBe('bounty')
    expect(parseBountyFields([
      Array.from(new TextEncoder().encode('jobescrow')),
      Array.from(new TextEncoder().encode('1')),
      Array.from(new TextEncoder().encode('fund'))
    ])).toBeNull()
  })
})

describe('tier release and fees', () => {
  it('withholds 8% from the high tier and leaves the rest of the pool', () => {
    const lines = releaseLines(800_000, 200_000, 800)
    expect(lines).toEqual({
      tierSats: 200_000,
      payoutFeeBps: 800,
      feeSats: 16_000,
      researcherSats: 184_000,
      poolLeft: 600_000,
      projectLockSats: 616_000
    })
    expect(payoutFeeSats(100, 800)).toBe(8)
    const released = releaseTier(posted(), 'high', '2026-10-13T15:00:00Z')
    expect(released.verdict).toMatchObject({
      feeSats: 16_000,
      researcherSats: 184_000,
      poolLeft: 600_000
    })
    expect(recordPlan(released)).toMatchObject({
      poolLockSats: 616_000,
      researcherSats: 184_000
    })
    expect(recordPlan(released).poolLockSats + recordPlan(released).researcherSats).toBe(800_000)
  })

  it('prices the payout fee under 10% and keeps the submission fee off the tier', () => {
    expect(MAX_PAYOUT_FEE_BPS).toBeLessThan(1_000)
    expect(payoutFeeSats(10_000, 999)).toBe(999)
    expect(() => payoutFeeSats(10_000, 1_000)).toThrow(/under 10%/)
    expect(() => fundPool({
      projectName: 'Northwind',
      scope: 'API',
      tiers: TIERS,
      payoutFeeBps: 1_000,
      submissionFeeSats: 1_000,
      exportFeeSats: 2_500
    }, WHEN, ID)).toThrow(/under 10%/)
    const cheap = fundPool({
      projectName: 'Northwind Devices',
      scope: 'Public API and the firmware updater.',
      tiers: TIERS,
      payoutFeeBps: 800,
      submissionFeeSats: 50,
      exportFeeSats: 2_500
    }, WHEN, ID)
    const expensive = fundPool({
      projectName: 'Northwind Devices',
      scope: 'Public API and the firmware updater.',
      tiers: TIERS,
      payoutFeeBps: 800,
      submissionFeeSats: 9_000,
      exportFeeSats: 2_500
    }, WHEN, ID)
    const left = releaseTier(submitReport(cheap, { researcherName: 'Ada', reportBody: BODY, at: WHEN }), 'low', '2026-10-13T13:00:00Z')
    const right = releaseTier(submitReport(expensive, { researcherName: 'Ada', reportBody: BODY, at: WHEN }), 'low', '2026-10-13T13:00:00Z')
    expect(left.verdict?.researcherSats).toBe(right.verdict?.researcherSats)
    expect(left.submission?.submissionFeeSats).toBe(50)
    expect(right.submission?.submissionFeeSats).toBe(9_000)
  })

  it('gives priority to the earlier hash', () => {
    const first: BountySubmit = {
      magic: 'bounty',
      version: '1',
      kind: 'submit',
      bountyId: ID,
      researcherName: 'Ada',
      reportHash: 'ab'.repeat(32),
      submissionFeeSats: 1_000,
      submittedAt: '2026-10-13T12:00:00Z'
    }
    const second: BountySubmit = { ...first, researcherName: 'Bea', reportHash: 'cd'.repeat(32), submittedAt: '2026-10-13T12:05:00Z' }
    expect(earlierSubmission([second, first])?.researcherName).toBe('Ada')
    const folded = deskFromRecords([funded().fund!, second, first])
    expect(folded?.submission?.researcherName).toBe('Ada')
  })
})

describe('timeline and export', () => {
  it('appends received, acknowledged, fixed, disclosed and rejects skips and earlier times', () => {
    const start = posted().timeline
    expect(start.map((event) => event.stage)).toEqual(['received'])
    const original = start.slice()
    const acknowledged = appendTimeline(start, 'acknowledged', '2026-10-13T18:00:00Z', ID)
    const fixed = appendTimeline(acknowledged, 'fixed', '2026-10-14T12:00:00Z', ID)
    const disclosed = appendTimeline(fixed, 'disclosed', '2026-10-20T12:00:00Z', ID)
    expect(disclosed.map((event) => event.stage)).toEqual(['received', 'acknowledged', 'fixed', 'disclosed'])
    expect(original).toHaveLength(1)
    expect(() => appendTimeline(start, 'fixed', '2026-10-14T12:00:00Z', ID)).toThrow(/Next is acknowledged/)
    expect(() => appendTimeline(acknowledged, 'acknowledged', '2026-10-13T19:00:00Z', ID)).toThrow(/Next is fixed/)
    expect(() => appendTimeline(acknowledged, 'fixed', '2026-10-13T11:00:00Z', ID)).toThrow(/earlier/)
    expect(() => appendTimeline(disclosed, 'received', '2026-10-21T12:00:00Z', ID)).toThrow(/already complete/)
  })

  it('formats the disclosure record and the 24h, 72h, and 14d clocks', () => {
    let desk = releaseTier(posted(), 'high', '2026-10-13T15:00:00Z')
    desk = {
      ...desk,
      timeline: ['acknowledged', 'fixed', 'disclosed'].reduce((events, stage, index) => {
        const at = ['2026-10-13T18:00:00Z', '2026-10-14T12:00:00Z', '2026-10-20T12:00:00Z'][index]!
        return appendTimeline(events, stage as 'acknowledged', at, ID)
      }, desk.timeline)
    }
    const text = formatExport(desk)
    expect(exportTimeline(desk).exportText).toBe(text)
    expect(text).toBe([
      'Bounty Desk disclosure record',
      `bounty: ${ID}`,
      'project: Northwind Devices',
      'scope: Public API and the firmware updater.',
      `report-hash: ${hashReport(BODY)}`,
      'tier: high',
      'tier-sats: 200000',
      'desk-fee-sats: 16000',
      'researcher-sats: 184000',
      'pool-left-sats: 600000',
      'submission-fee-sats: 1000',
      'export-fee-sats: 2500',
      'timeline:',
      'received 2026-10-13T12:00:00Z',
      'acknowledged 2026-10-13T18:00:00Z',
      'fixed 2026-10-14T12:00:00Z',
      'disclosed 2026-10-20T12:00:00Z',
      'duties:',
      'early-warning-24h on-time',
      'full-notice-72h on-time',
      'final-report-14d on-time',
      `note: ${EXPORT_NOTE}`
    ].join('\n'))
    expect(text).not.toContain('SECRET-BUG-BODY')
    expect(text).toMatch(/not legal compliance advice/)
  })

  it('marks a late early-warning that is still inside 72h, and a late final report', () => {
    let desk = posted()
    desk = {
      ...desk,
      timeline: appendTimeline(
        appendTimeline(
          appendTimeline(desk.timeline, 'acknowledged', '2026-10-15T12:00:00Z', ID),
          'fixed',
          '2026-10-16T12:00:00Z',
          ID
        ),
        'disclosed',
        '2026-11-01T12:00:00Z',
        ID
      )
    }
    const text = formatExport(desk)
    expect(text).toContain('early-warning-24h late')
    expect(text).toContain('full-notice-72h on-time')
    expect(text).toContain('final-report-14d late')
  })

  it('keeps an out-of-order timeline event off the folded book', () => {
    const desk = posted()
    const skipped = {
      magic: 'bounty' as const,
      version: '1' as const,
      kind: 'timeline' as const,
      bountyId: ID,
      stage: 'disclosed' as const,
      at: '2026-10-13T13:00:00Z'
    }
    const folded = deskFromRecords([desk.fund!, desk.submission!, ...desk.timeline, skipped])
    expect(folded?.timeline.map((event) => event.stage)).toEqual(['received'])
    expect(bookFromRecords([desk.fund!, { ...desk.fund!, magic: 'cover' } as unknown as typeof desk.fund]).map((row) => row.bountyId)).toEqual([ID])
  })
})
