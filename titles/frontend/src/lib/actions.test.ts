import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TRANSFER_SATS } from '../../../protocol/title'
import {
  assertCanExport,
  assertCanIssue,
  assertCanTransfer,
  formatSats,
  issuePriceSats
} from './actions'
import { NOT_HOLDER } from './copy'
import { heldLine, holderFaceName } from './identity'

const here = dirname(fileURLToPath(import.meta.url))
const actionsSrc = readFileSync(join(here, 'actions.ts'), 'utf8')
const protocolSrc = readFileSync(join(here, '../../../protocol/title.ts'), 'utf8')
const appSrc = readFileSync(join(here, '../App.tsx'), 'utf8')

const HOLDER = `02${'ab'.repeat(32)}`
const OTHER = `03${'cd'.repeat(32)}`

describe('issue price', () => {
  it('stores a whole sat price without a dollar face', () => {
    expect(issuePriceSats({ priceSats: 100 })).toBe(100)
    expect(formatSats(100)).toBe('100 sats')
    expect(formatSats(1)).toBe('1 sat')
    expect(formatSats(100)).not.toMatch(/\$0\.00/)
    expect(formatSats(100)).not.toMatch(/APY/)
  })

  it('requires a label, a document, and a whole sat price', () => {
    expect(() => assertCanIssue({
      label: '',
      document: 'bill',
      priceSats: 100
    })).toThrow('Title is required.')
    expect(() => assertCanIssue({
      label: 'Dawn lot 12',
      document: '   ',
      priceSats: 100
    })).toThrow('Paste the document, or a document hash.')
    expect(() => assertCanIssue({
      label: 'Dawn lot 12',
      document: 'bill',
      priceSats: 0
    })).toThrow('price must be at least 1 sat')
  })
})

describe('holder gates', () => {
  it('lets only the current holder transfer or export', () => {
    expect(() => assertCanTransfer({ holder: HOLDER }, HOLDER)).not.toThrow()
    expect(() => assertCanExport({ holder: HOLDER }, HOLDER)).not.toThrow()
    expect(() => assertCanTransfer({ holder: HOLDER }, OTHER)).toThrow(NOT_HOLDER)
    expect(() => assertCanExport({ holder: HOLDER }, OTHER)).toThrow(NOT_HOLDER)
    expect(holderFaceName(null)).toBe('Holder')
    expect(holderFaceName('Alex')).toBe('Alex')
    expect(holderFaceName(`02${'ab'.repeat(32)}`)).toBe('Holder')
    expect(heldLine(null)).toBe('Holder')
    expect(heldLine('Alex')).toBe('Held by Alex')
    expect(heldLine(`02${'ab'.repeat(32)}`)).toBe('Holder')
  })
})

describe('title custody', () => {
  it('does not encode document bytes on the overlay title', () => {
    expect(protocolSrc).not.toContain('stringToUtf8Bytes(item.dump)')
    expect(protocolSrc).not.toMatch(/encodeTitleFields[\s\S]*item\.dump/)
    expect(actionsSrc).toContain('resolveDocHash')
    expect(actionsSrc).toContain('TRANSFER_SATS')
    expect(actionsSrc).toContain('satoshis: TRANSFER_SATS')
    expect(TRANSFER_SATS).toBe(1)
    expect(actionsSrc).not.toMatch(/yield|APY|USDC/)
    expect(appSrc).not.toContain('row.holder}')
  })
})
