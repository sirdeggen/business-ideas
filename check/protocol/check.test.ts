import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CHECK_FEE_SATS,
  DEFAULT_FIRST_TIME_THRESHOLD_SATS,
  DEFAULT_REPORTER_SHARE_BPS,
  DEMO_BLOCK_FLAG_ID,
  DEMO_FIRST_PAYEE,
  DEMO_FLAGGED_PAYMAIL,
  DEMO_LOOKALIKE_PAYEE,
  DEMO_PRIOR_PAYEE,
  DEMO_VENDOR_LOOKALIKE,
  DEMO_VENDOR_PRIOR,
  DEMO_WARN_FLAG_ID,
  FIRST_TIME_REASON,
  LOOKALIKE_REASON,
  MAGIC,
  PASS_REASON,
  PROTOCOL_ID,
  SEED_FLAGS,
  creditStop,
  encodeFlagFields,
  encodeReceiptFields,
  fileFlag,
  flagsFromRecords,
  keepMagic,
  parseCheckFields,
  parseVendorCsv,
  receiptMatches,
  receiptToken,
  reporterShareOf,
  runBatch,
  runCheck,
  stringToUtf8Bytes
} from './check'

const NOW = '2026-10-13T16:00:00Z'
const ID = 'ab'.repeat(16)
const PRIORS = [DEMO_PRIOR_PAYEE, DEMO_VENDOR_PRIOR]

function check(payee: string, amountSats: number, flags = SEED_FLAGS, payerRef = 'PO-100') {
  return runCheck({
    payee,
    amountSats,
    payerRef,
    priorPayees: PRIORS,
    flags,
    checkFeeSats: DEFAULT_CHECK_FEE_SATS,
    reporterShareBps: DEFAULT_REPORTER_SHARE_BPS,
    firstTimeThresholdSats: DEFAULT_FIRST_TIME_THRESHOLD_SATS
  }, NOW, ID)
}

describe('check verdicts', () => {
  it('blocks a payee a reporter flagged, and warns on a warn-level flag', () => {
    const blocked = check(DEMO_FLAGGED_PAYMAIL.toUpperCase(), 1_000)
    expect(blocked.verdict).toBe('block')
    expect(blocked.citedFlagIds).toEqual([DEMO_BLOCK_FLAG_ID])
    expect(blocked.reason).toContain('Northwind Demo Books')
    expect(blocked.reason).toContain('Demo data')
    expect(blocked.lookalikeOf).toBe('')

    const warned = check(DEMO_LOOKALIKE_PAYEE, 1_000)
    expect(warned.verdict).toBe('warn')
    expect(warned.citedFlagIds).toEqual([DEMO_WARN_FLAG_ID])
    expect(warned.reason).toContain('Harbor Demo Treasury')
    expect(PROTOCOL_ID).toEqual([0, 'check'])
    expect(MAGIC).toBe('check')
  })

  it('warns on a lookalike of a prior payee when no flag matches', () => {
    const poisoning = check(DEMO_LOOKALIKE_PAYEE, 50, [])
    expect(poisoning.verdict).toBe('warn')
    expect(poisoning.reason).toBe(LOOKALIKE_REASON)
    expect(poisoning.lookalikeOf).toBe(DEMO_PRIOR_PAYEE)
    expect(poisoning.citedFlagIds).toEqual([])

    const vendor = check(DEMO_VENDOR_LOOKALIKE, 50, [])
    expect(vendor.verdict).toBe('warn')
    expect(vendor.lookalikeOf).toBe(DEMO_VENDOR_PRIOR)

    const typo = check(`${DEMO_VENDOR_PRIOR.slice(0, -1)}x`, 50, [])
    expect(typo.verdict).toBe('warn')
    expect(typo.reason).toBe(LOOKALIKE_REASON)

    const same = check(DEMO_PRIOR_PAYEE, 9_000_000, [])
    expect(same.verdict).toBe('pass')
    expect(same.lookalikeOf).toBe('')
  })

  it('warns on a first-time payee above the threshold and passes at or under it', () => {
    const over = check(DEMO_FIRST_PAYEE, DEFAULT_FIRST_TIME_THRESHOLD_SATS + 1, [])
    expect(over.verdict).toBe('warn')
    expect(over.reason).toBe(FIRST_TIME_REASON)

    const at = check(DEMO_FIRST_PAYEE, DEFAULT_FIRST_TIME_THRESHOLD_SATS, [])
    expect(at.verdict).toBe('pass')
    expect(at.reason).toBe(PASS_REASON)

    const known = check(DEMO_VENDOR_PRIOR, DEFAULT_FIRST_TIME_THRESHOLD_SATS + 1, [])
    expect(known.verdict).toBe('pass')
  })

  it('lets a flag beat a lookalike', () => {
    const both = check(DEMO_LOOKALIKE_PAYEE, 10)
    expect(both.verdict).toBe('warn')
    expect(both.citedFlagIds).toEqual([DEMO_WARN_FLAG_ID])
    expect(both.reason).not.toBe(LOOKALIKE_REASON)
  })
})

describe('receipt hash and fees', () => {
  it('binds the hash to payee, amount, payer ref, verdict, flags consulted, and time', () => {
    const receipt = check(DEMO_VENDOR_PRIOR, 4_000, [], 'PO-100')
    expect(receiptMatches(receipt)).toBe(true)
    expect(receipt.receiptHash).toBe(receiptToken(receipt))
    expect(receipt.consultedFlagIds).toEqual([])

    const otherAmount = check(DEMO_VENDOR_PRIOR, 4_001, [], 'PO-100')
    expect(otherAmount.receiptHash).not.toBe(receipt.receiptHash)

    const otherRef = runCheck({
      payee: DEMO_VENDOR_PRIOR,
      amountSats: 4_000,
      payerRef: 'PO-101',
      priorPayees: PRIORS,
      flags: [],
      checkFeeSats: DEFAULT_CHECK_FEE_SATS,
      reporterShareBps: DEFAULT_REPORTER_SHARE_BPS,
      firstTimeThresholdSats: DEFAULT_FIRST_TIME_THRESHOLD_SATS
    }, NOW, ID)
    expect(otherRef.receiptHash).not.toBe(receipt.receiptHash)

    const later = runCheck({
      payee: DEMO_VENDOR_PRIOR,
      amountSats: 4_000,
      payerRef: 'PO-100',
      priorPayees: PRIORS,
      flags: [],
      checkFeeSats: DEFAULT_CHECK_FEE_SATS,
      reporterShareBps: DEFAULT_REPORTER_SHARE_BPS,
      firstTimeThresholdSats: DEFAULT_FIRST_TIME_THRESHOLD_SATS
    }, '2026-10-13T16:05:00Z', ID)
    expect(later.receiptHash).not.toBe(receipt.receiptHash)

    const withFlags = check(DEMO_VENDOR_PRIOR, 4_000, SEED_FLAGS, 'PO-100')
    expect(withFlags.verdict).toBe('pass')
    expect(withFlags.consultedFlagIds).toEqual([DEMO_BLOCK_FLAG_ID, DEMO_WARN_FLAG_ID])
    expect(withFlags.receiptHash).not.toBe(receipt.receiptHash)
    expect(withFlags.checkFeeSats).toBe(10)
    expect(check(DEMO_VENDOR_PRIOR, 1, [], 'PO-100').checkFeeSats).toBe(10)
  })

  it('floors the reporter share and credits it only when a cited flag stops the payment', () => {
    expect(reporterShareOf(10, 5_000)).toBe(5)
    expect(reporterShareOf(1, 5_000)).toBe(0)
    expect(reporterShareOf(3, 5_000)).toBe(1)
    expect(reporterShareOf(10, 4_999)).toBe(4)
    expect(reporterShareOf(0, 5_000)).toBe(0)

    const blocked = check(DEMO_FLAGGED_PAYMAIL, 2_000)
    expect(blocked.reporterShareSats).toBe(0)
    expect(blocked.stopped).toBe(false)
    const stopped = creditStop(blocked, SEED_FLAGS)
    expect(stopped.stopped).toBe(true)
    expect(stopped.reporterShareSats).toBe(5)
    expect(stopped.reporterName).toBe('Northwind Demo Books')
    expect(stopped.receiptHash).toBe(blocked.receiptHash)
    expect(receiptMatches(stopped)).toBe(true)

    const lookalike = check(DEMO_VENDOR_LOOKALIKE, 50, [])
    expect(() => creditStop(lookalike, [])).toThrow(/cited/i)
    const clean = check(DEMO_VENDOR_PRIOR, 50, [])
    expect(() => creditStop(clean, SEED_FLAGS)).toThrow(/pass/i)
  })
})

describe('encode, decode, and the vendor file', () => {
  it('round-trips a flag and a stopped receipt', () => {
    const flag = SEED_FLAGS[0]
    expect(parseCheckFields(encodeFlagFields(flag))).toEqual(flag)
    const stopped = creditStop(check(DEMO_FLAGGED_PAYMAIL, 2_000), SEED_FLAGS)
    expect(parseCheckFields(encodeReceiptFields(stopped))).toEqual(stopped)
    const filed = fileFlag({
      reporterName: 'Quill Demo Parish',
      subjectKind: 'script',
      subject: 'ff'.repeat(32),
      severity: 'warn',
      note: 'Demo data. A fictional parish reported this script hash.',
      stakeSats: 25
    }, NOW, 'cd'.repeat(16))
    expect(filed.demo).toBe(false)
    expect(parseCheckFields(encodeFlagFields(filed))?.subjectKind).toBe('script')
  })

  it('keeps only MAGIC check on the public book', () => {
    const flag = SEED_FLAGS[1]
    const foreign = { ...flag, magic: 'scrip' }
    expect(keepMagic([flag, foreign])).toEqual([flag])
    expect(flagsFromRecords([flag, foreign as typeof flag])).toEqual([flag])
    expect(parseCheckFields([
      stringToUtf8Bytes('scrip'),
      stringToUtf8Bytes('1'),
      stringToUtf8Bytes('flag'),
      stringToUtf8Bytes(DEMO_WARN_FLAG_ID)
    ])).toBeNull()
    expect(parseCheckFields([
      stringToUtf8Bytes('closing'),
      stringToUtf8Bytes('1'),
      stringToUtf8Bytes('receipt'),
      stringToUtf8Bytes(ID)
    ])).toBeNull()
  })

  it('parses a vendor-file CSV into rows and skips a bad amount', () => {
    const parsed = parseVendorCsv([
      'vendor,payee,amount,ref',
      `Northwind,${DEMO_FLAGGED_PAYMAIL},"1,000",PO-1`,
      `Acme,${DEMO_VENDOR_PRIOR},5000,PO-2`,
      'Bad,not-a-number,PO-3'
    ].join('\n'))
    expect(parsed.errors).toEqual(['Line 4: amount must be whole sats.'])
    expect(parsed.rows).toEqual([
      { line: 2, payee: DEMO_FLAGGED_PAYMAIL, amountSats: 1000, payerRef: 'PO-1' },
      { line: 3, payee: DEMO_VENDOR_PRIOR, amountSats: 5000, payerRef: 'PO-2' }
    ])
    const batch = runBatch(parsed.rows, {
      priorPayees: PRIORS,
      flags: SEED_FLAGS,
      checkFeeSats: 10,
      reporterShareBps: 5_000,
      firstTimeThresholdSats: DEFAULT_FIRST_TIME_THRESHOLD_SATS
    }, NOW)
    expect(batch.map((row) => row.verdict)).toEqual(['block', 'pass'])
    expect(batch[0]?.checkFeeSats).toBe(10)
    expect(batch[0]?.checkId).not.toBe(batch[1]?.checkId)
  })
})
