import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  PROTOCOL_FEE_BPS,
  SCHEMA_VERSION,
  canChallenge,
  canRefund,
  canRelease,
  canSubmit,
  encodeChallengeFields,
  encodeFundFields,
  encodeRefundFields,
  encodeReleaseFields,
  encodeSubmitFields,
  isClient,
  isProvider,
  jobStatus,
  parseJobFields,
  protocolFeeSats,
  sheetTitle,
  type JobFund
} from '../../../protocol/jobescrow'

const CLIENT = `02${'ab'.repeat(32)}`
const PROVIDER = `03${'cd'.repeat(32)}`
const JOB_ID = 'a'.repeat(32)
const HASH = 'b'.repeat(64)

function fund(overrides: Partial<JobFund> = {}): JobFund {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'fund',
    jobId: JOB_ID,
    label: 'Shop repair',
    providerName: 'Ada',
    providerIdentity: PROVIDER,
    amountSats: 100_000,
    clientIdentity: CLIENT,
    createdAt: '2026-09-01T12:00:00Z',
    ...overrides
  }
}

describe('job state', () => {
  it('moves funded → submitted → released, or challenge / refund', () => {
    expect(jobStatus({})).toBeNull()
    expect(jobStatus({ fund: true })).toBe('funded')
    expect(jobStatus({ fund: true, submit: true })).toBe('submitted')
    expect(jobStatus({ fund: true, submit: true, challenge: true })).toBe('challenged')
    expect(jobStatus({ fund: true, submit: true, release: true })).toBe('released')
    expect(jobStatus({ fund: true, refund: true })).toBe('refunded')
    expect(canSubmit('funded')).toBe(true)
    expect(canSubmit('submitted')).toBe(false)
    expect(canRelease('submitted')).toBe(true)
    expect(canRelease('challenged')).toBe(true)
    expect(canChallenge('funded')).toBe(true)
    expect(canChallenge('submitted')).toBe(true)
    expect(canRefund('challenged')).toBe(true)
    expect(canRefund('released')).toBe(false)
  })

  it('titles the ticket from the next job action', () => {
    expect(sheetTitle(null)).toBe('Job')
    expect(sheetTitle('funded')).toBe('Submit')
    expect(sheetTitle('submitted')).toBe('Release')
    expect(sheetTitle('challenged')).toBe('Refund')
    expect(sheetTitle('released')).toBe('Released')
    expect(sheetTitle('refunded')).toBe('Refunded')
  })

  it('gates client and provider by identity', () => {
    const row = fund()
    expect(isClient(row, CLIENT)).toBe(true)
    expect(isProvider(row, PROVIDER)).toBe(true)
    expect(isClient(row, PROVIDER)).toBe(false)
    expect(isProvider(row, CLIENT)).toBe(false)
  })
})

describe('protocol fee story', () => {
  it('is about 2% and is not a GMV figure', () => {
    expect(PROTOCOL_FEE_BPS).toBe(200)
    expect(protocolFeeSats(100_000)).toBe(2000)
    expect(protocolFeeSats(1)).toBe(0)
  })
})

describe('encode / decode', () => {
  it('round-trips fund, submit, release, challenge, and refund', () => {
    const written = fund()
    expect(parseJobFields(encodeFundFields(written))).toEqual(written)
    expect(parseJobFields(encodeSubmitFields({
      jobId: JOB_ID,
      deliverableHash: HASH,
      providerIdentity: PROVIDER,
      submittedAt: '2026-09-01T13:00:00Z'
    }))).toMatchObject({ kind: 'submit', deliverableHash: HASH })
    expect(parseJobFields(encodeReleaseFields({
      jobId: JOB_ID,
      clientIdentity: CLIENT,
      releasedAt: '2026-09-01T14:00:00Z'
    }))).toMatchObject({ kind: 'release' })
    expect(parseJobFields(encodeChallengeFields({
      jobId: JOB_ID,
      clientIdentity: CLIENT,
      challengedAt: '2026-09-01T13:30:00Z'
    }))).toMatchObject({ kind: 'challenge' })
    expect(parseJobFields(encodeRefundFields({
      jobId: JOB_ID,
      clientIdentity: CLIENT,
      refundedAt: '2026-09-01T15:00:00Z'
    }))).toMatchObject({ kind: 'refund' })
  })

  it('keeps MAGIC jobescrow at least five characters', () => {
    expect(MAGIC.length).toBeGreaterThanOrEqual(5)
    expect(MAGIC).toBe('jobescrow')
  })

  it('does not treat a missing MAGIC as a job', () => {
    expect(parseJobFields([
      Array.from(new TextEncoder().encode('membership'))
    ])).toBeNull()
    expect(parseJobFields([
      Array.from(new TextEncoder().encode('streampay'))
    ])).toBeNull()
  })
})
