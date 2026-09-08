import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CLAIM_SATS, TRANSFER_SATS } from '../../../protocol/claim'
import {
  assertCanIssue,
  assertCanRedeem,
  assertCanTransfer,
  formatSats,
  issuePriceSats
} from './actions'
import { NOT_HOLDER } from './copy'
import { heldLine, holderFaceName } from './identity'

const here = dirname(fileURLToPath(import.meta.url))
const actionsSrc = readFileSync(join(here, 'actions.ts'), 'utf8')
const protocolSrc = readFileSync(join(here, '../../../protocol/claim.ts'), 'utf8')
const appSrc = readFileSync(join(here, '../App.tsx'), 'utf8')

const HOLDER = `02${'ab'.repeat(32)}`
const OTHER = `03${'cd'.repeat(32)}`

describe('issue price', () => {
  it('stores a whole sat price without a dollar face', () => {
    expect(issuePriceSats({ priceSats: 100 })).toBe(100)
    expect(issuePriceSats({ priceSats: 0 })).toBe(0)
    expect(formatSats(100)).toBe('100 sats')
    expect(formatSats(1)).toBe('1 sat')
    expect(formatSats(100)).not.toMatch(/\$0\.00/)
    expect(formatSats(100)).not.toMatch(/APY/)
  })

  it('requires a label and item, and allows a zero sale price', () => {
    expect(() => assertCanIssue({
      label: '',
      itemId: 'PSA-81234567',
      sample: '',
      priceSats: 100
    })).toThrow('Label is required.')
    expect(() => assertCanIssue({
      label: 'Charizard 4/102',
      itemId: '   ',
      sample: '',
      priceSats: 100
    })).toThrow('Item id is required.')
    expect(() => assertCanIssue({
      label: 'Charizard 4/102',
      itemId: 'PSA-81234567',
      sample: '',
      priceSats: 0
    })).not.toThrow()
    expect(() => assertCanIssue({
      label: 'Charizard 4/102',
      itemId: 'PSA-81234567',
      sample: '',
      priceSats: -1
    })).toThrow('price cannot be negative')
  })
})

describe('holder gates', () => {
  it('lets only the current holder transfer or redeem', () => {
    expect(() => assertCanTransfer({ holder: HOLDER }, HOLDER)).not.toThrow()
    expect(() => assertCanRedeem({ holder: HOLDER }, HOLDER)).not.toThrow()
    expect(() => assertCanTransfer({ holder: HOLDER }, OTHER)).toThrow(NOT_HOLDER)
    expect(() => assertCanRedeem({ holder: HOLDER }, OTHER)).toThrow(NOT_HOLDER)
    expect(holderFaceName(null)).toBe('Holder')
    expect(holderFaceName('Alex')).toBe('Alex')
    expect(holderFaceName(`02${'ab'.repeat(32)}`)).toBe('Holder')
    expect(heldLine(null)).toBe('Holder')
    expect(heldLine('Alex')).toBe('Held by Alex')
    expect(heldLine(`02${'ab'.repeat(32)}`)).toBe('Holder')
  })
})

describe('vault claim custody', () => {
  it('does not encode photo bytes on the overlay claim', () => {
    expect(protocolSrc).not.toContain('stringToUtf8Bytes(item.sample)')
    expect(protocolSrc).not.toMatch(/encodeClaimFields[\s\S]*item\.sample[^H]/)
    expect(actionsSrc).toContain('resolveSampleHash')
    expect(actionsSrc).toContain('CLAIM_SATS')
    expect(actionsSrc).toContain('satoshis: CLAIM_SATS')
    expect(actionsSrc).toContain('satoshis: TRANSFER_SATS')
    expect(CLAIM_SATS).toBe(1)
    expect(TRANSFER_SATS).toBe(1)
    expect(actionsSrc).not.toMatch(/yield|APY|USDC|gacha|loot/)
    expect(appSrc).not.toContain('row.holder}')
  })
})
