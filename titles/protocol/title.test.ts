import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  SCHEMA_VERSION,
  TRANSFER_SATS,
  currentTitles,
  encodeExportFields,
  encodeTitleFields,
  formatSats,
  isHolder,
  makeTitleId,
  parseTitleFields,
  resolveDocHash,
  validatePrice,
  validateTitle,
  type TitleExport,
  type TitleToken
} from './title'

const ISSUER = `02${'ab'.repeat(32)}`
const HOLDER = `03${'cd'.repeat(32)}`
const OTHER = `02${'ef'.repeat(32)}`
const DOC = 'Bill of lading — vessel Dawn, lot 12\n'

function title(partial: Partial<TitleToken> = {}): TitleToken {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'title',
    titleId: makeTitleId(ISSUER, 'Dawn lot 12', '2026-09-01T10:00:00Z', 'aa'),
    label: 'Dawn lot 12',
    docHash: resolveDocHash(DOC),
    holder: ISSUER,
    issuer: ISSUER,
    priceSats: 100,
    timestamp: '2026-09-01T10:00:00Z',
    ...partial
  }
}

function exported(partial: Partial<TitleExport> = {}): TitleExport {
  const row = title()
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'export',
    titleId: row.titleId,
    holder: ISSUER,
    docHash: row.docHash,
    timestamp: '2026-09-01T10:05:00Z',
    ...partial
  }
}

function fieldTexts(fields: number[][]): string[] {
  return fields.map((field) => new TextDecoder().decode(Uint8Array.from(field)))
}

describe('title desk protocol', () => {
  it('round-trips a title without the document bytes', () => {
    const item = title()
    const fields = encodeTitleFields(item)
    expect(fieldTexts(fields)).toEqual([
      MAGIC,
      SCHEMA_VERSION,
      'title',
      item.titleId,
      item.label,
      item.docHash,
      item.holder,
      item.issuer,
      String(item.priceSats),
      item.timestamp
    ])
    expect(fieldTexts(fields)).not.toContain(DOC)
    expect(fieldTexts(fields).join('\n')).not.toContain('vessel Dawn')
    const parsed = parseTitleFields(fields)
    expect(parsed).toEqual(item)
    expect(validateTitle(parsed as TitleToken)).toBeNull()
  })

  it('still parses when extra fields sit before MAGIC', () => {
    const item = title()
    const extra = [Array.from(new TextEncoder().encode('pubkey'))]
    expect(parseTitleFields([...extra, ...encodeTitleFields(item)])).toEqual(item)
  })

  it('round-trips a custody export', () => {
    const item = exported()
    const parsed = parseTitleFields(encodeExportFields(item))
    expect(parsed).toEqual(item)
  })

  it('hashes pasted bytes and accepts a 64-hex document hash', () => {
    const hashed = resolveDocHash(DOC)
    expect(hashed).toMatch(/^[0-9a-f]{64}$/)
    expect(resolveDocHash(hashed)).toBe(hashed)
    expect(resolveDocHash(`0x${hashed}`)).toBe(hashed)
    expect(resolveDocHash('')).toBe('')
  })

  it('keeps the current holder as the latest title token', () => {
    const first = title()
    const moved = title({
      holder: HOLDER,
      timestamp: '2026-09-01T11:00:00Z'
    })
    const other = title({
      titleId: makeTitleId(OTHER, 'Other lot', '2026-09-01T09:00:00Z', 'bb'),
      label: 'Other lot',
      holder: OTHER,
      issuer: OTHER,
      timestamp: '2026-09-01T09:00:00Z'
    })
    const live = currentTitles([first, moved, other])
    expect(live).toHaveLength(2)
    expect(live.find((row) => row.titleId === first.titleId)?.holder).toBe(HOLDER)
    expect(isHolder(moved, HOLDER)).toBe(true)
    expect(isHolder(moved, ISSUER)).toBe(false)
  })

  it('rejects a zero-sat price and formats sats without dollars', () => {
    expect(validatePrice(0)).toBe('price must be at least 1 sat')
    expect(validatePrice(1.5)).toBe('price must be a whole number of sats')
    expect(formatSats(1)).toBe('1 sat')
    expect(formatSats(100)).toBe('100 sats')
    expect(formatSats(100)).not.toMatch(/\$/)
    expect(TRANSFER_SATS).toBe(1)
  })

  it('rejects an empty label', () => {
    expect(parseTitleFields(encodeTitleFields(title({ label: '' })))).toBeNull()
  })
})
