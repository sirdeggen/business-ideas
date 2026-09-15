import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BOND_SATS,
  FEE_SATS,
  MAGIC,
  SCHEMA_VERSION,
  canRelease,
  canSlash,
  currentVouches,
  encodeAttestFields,
  encodeReleaseFields,
  encodeSlashFields,
  encodeVouchFields,
  filterVouchPayloads,
  formatSats,
  liveBond,
  makeVouchId,
  matchAttests,
  matchVouches,
  parseVouchFields,
  resolveNoteHash,
  selectVouch,
  stringToUtf8Bytes,
  validateBond,
  vouchStatus,
  type VouchAttest,
  type VouchRelease,
  type VouchSlash,
  type VouchToken
} from './vouch'

const VOUCHER = `02${'ab'.repeat(32)}`
const SLASHER = `03${'cd'.repeat(32)}`
const OTHER = `02${'ef'.repeat(32)}`

function vouch(partial: Partial<VouchToken> = {}): VouchToken {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'vouch',
    vouchId: 'a1b2c3d4e5f67890',
    label: 'Harbor steel',
    subject: 'North Mill',
    subjectIdentity: '',
    voucher: VOUCHER,
    slasher: VOUCHER,
    bondSats: DEFAULT_BOND_SATS,
    writeFeeSats: FEE_SATS,
    timestamp: '2026-09-15T12:00:00Z',
    ...partial
  }
}

function attest(partial: Partial<VouchAttest> = {}): VouchAttest {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'attest',
    vouchId: 'a1b2c3d4e5f67890',
    attestor: OTHER,
    note: 'Checked incorporation and bank letter.',
    noteHash: resolveNoteHash('Checked incorporation and bank letter.'),
    writeFeeSats: FEE_SATS,
    timestamp: '2026-09-15T13:00:00Z',
    ...partial
  }
}

function slashed(partial: Partial<VouchSlash> = {}): VouchSlash {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'slash',
    vouchId: 'a1b2c3d4e5f67890',
    slasher: VOUCHER,
    reason: 'Invoice for goods that never shipped.',
    timestamp: '2026-09-15T14:00:00Z',
    ...partial
  }
}

function released(partial: Partial<VouchRelease> = {}): VouchRelease {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'release',
    vouchId: 'a1b2c3d4e5f67890',
    voucher: VOUCHER,
    timestamp: '2026-09-15T14:00:00Z',
    ...partial
  }
}

function fieldTexts(fields: number[][]): string[] {
  return fields.map((field) => new TextDecoder().decode(Uint8Array.from(field)))
}

describe('field rules', () => {
  it('keeps a small write fee and a whole-sat bond', () => {
    expect(FEE_SATS).toBe(100_000)
    expect(DEFAULT_BOND_SATS).toBe(1_000_000)
    expect(formatSats(FEE_SATS)).toBe('100,000 sats')
    expect(formatSats(1)).toBe('1 sat')
    expect(validateBond(0)).toBe('Bond must be at least 1 sat.')
    expect(validateBond(1.5)).toBe('Bond must be a whole number of sats.')
  })

  it('derives a 16-hex vouch id', () => {
    const id = makeVouchId({
      voucher: VOUCHER,
      subject: 'North Mill',
      timestamp: '2026-09-15T12:00:00Z',
      nonce: 'n1'
    })
    expect(id).toMatch(/^[0-9a-f]{16}$/)
    expect(makeVouchId({
      voucher: VOUCHER,
      subject: 'North Mill',
      timestamp: '2026-09-15T12:00:00Z',
      nonce: 'n1'
    })).toBe(id)
    expect(makeVouchId({
      voucher: VOUCHER,
      subject: 'North Mill',
      timestamp: '2026-09-15T12:00:00Z',
      nonce: 'n2'
    })).not.toBe(id)
  })
})

describe('live bond', () => {
  it('keeps the latest unslashed vouch and drops a slashed bond', () => {
    const first = vouch()
    const other = vouch({
      vouchId: 'ffffffffffffffff',
      label: 'Other mill',
      subject: 'South Dock',
      timestamp: '2026-09-15T11:00:00Z'
    })
    const burn = slashed()
    expect(parseVouchFields(encodeSlashFields(burn))).toEqual(burn)
    const live = currentVouches([first, other], [burn])
    expect(live).toHaveLength(1)
    expect(live[0]?.vouchId).toBe(other.vouchId)
    expect(liveBond(first, [burn])).toBe(false)
    expect(liveBond(other, [burn])).toBe(true)
    expect(vouchStatus(first, [burn], [])).toBe('slashed')
    expect(vouchStatus(other, [burn], [])).toBe('live')
  })

  it('drops a released bond from the live list', () => {
    const first = vouch()
    expect(vouchStatus(first, [], [released()])).toBe('released')
    expect(currentVouches([first], [released()])).toHaveLength(0)
    expect(liveBond(first, [released()])).toBe(false)
  })

  it('lets the voucher or a designated slasher slash, voucher only to release', () => {
    const row = vouch({ slasher: SLASHER })
    expect(canSlash(row, VOUCHER)).toBe(true)
    expect(canSlash(row, SLASHER)).toBe(true)
    expect(canSlash(row, OTHER)).toBe(false)
    expect(canRelease(row, VOUCHER)).toBe(true)
    expect(canRelease(row, SLASHER)).toBe(false)
  })
})

describe('search', () => {
  it('finds a vouch by id, subject, or label, and an attestation by note', () => {
    const harbor = vouch()
    const other = vouch({
      vouchId: 'ffffffffffffffff',
      label: 'Other mill',
      subject: 'South Dock',
      timestamp: '2026-09-15T11:00:00Z'
    })
    expect(selectVouch([harbor, other], 'a1b2c3d4e5f67890')?.subject).toBe('North Mill')
    expect(selectVouch([harbor, other], 'a1b2c3d4')?.vouchId).toBe(harbor.vouchId)
    expect(matchVouches([harbor, other], 'north').map((row) => row.subject)).toEqual(['North Mill'])
    expect(matchVouches([harbor, other], 'harbor steel')[0]?.label).toBe('Harbor steel')
    expect(selectVouch([harbor, other], 'no-such')).toBeNull()
    expect(matchAttests([attest()], 'incorporation')[0]?.note).toMatch(/incorporation/)
  })
})

describe('encode / parse', () => {
  it('round-trips a vouch with bond, fee, and subject', () => {
    const row = vouch()
    const fields = encodeVouchFields(row)
    expect(fieldTexts(fields)).toEqual([
      MAGIC,
      SCHEMA_VERSION,
      'vouch',
      row.vouchId,
      'Harbor steel',
      'North Mill',
      '',
      row.voucher,
      row.slasher,
      String(DEFAULT_BOND_SATS),
      String(FEE_SATS),
      row.timestamp
    ])
    expect(parseVouchFields(fields)).toEqual(row)
  })

  it('round-trips attest, slash, and release', () => {
    const checked = attest()
    expect(parseVouchFields(encodeAttestFields(checked))).toEqual(checked)
    expect(parseVouchFields(encodeSlashFields(slashed()))).toEqual(slashed())
    expect(parseVouchFields(encodeReleaseFields(released()))).toEqual(released())
  })

  it('finds MAGIC among lock padding and drops foreign protocols', () => {
    const row = vouch()
    const padded = [
      new Uint8Array([2, ...new Uint8Array(32)]),
      ...encodeVouchFields(row)
    ]
    expect(parseVouchFields(padded)).toEqual(row)
    expect(parseVouchFields([stringToUtf8Bytes('namelease'), stringToUtf8Bytes('1')])).toBeNull()
    expect(parseVouchFields([stringToUtf8Bytes('trace'), stringToUtf8Bytes('1')])).toBeNull()
    expect(filterVouchPayloads([
      { ...row, magic: 'namelease' as typeof MAGIC },
      { ...row, magic: 'trace' as typeof MAGIC },
      row
    ])).toEqual([row])
  })

  it('hashes an optional note and rejects empty subject or label', () => {
    const hashed = resolveNoteHash('Checked incorporation and bank letter.')
    expect(hashed).toMatch(/^[0-9a-f]{64}$/)
    expect(resolveNoteHash(hashed)).toBe(hashed)
    expect(resolveNoteHash('')).toBe('')
    expect(() => encodeVouchFields({ ...vouch(), label: '' })).toThrow('Label is required.')
    expect(() => encodeVouchFields({ ...vouch(), subject: '' })).toThrow('Name the supplier.')
  })
})
