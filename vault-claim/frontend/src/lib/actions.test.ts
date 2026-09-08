import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TRANSFER_SATS } from '../../../protocol/claim'
import {
  assertCanMint,
  assertCanRedeem,
  assertCanTransfer,
  assertSerialFree,
  formatSats,
  mintPriceSats
} from './actions'
import { NOT_HOLDER, SERIAL_TAKEN } from './copy'
import { heldLine, holderFaceName } from './identity'

const here = dirname(fileURLToPath(import.meta.url))
const actionsSrc = readFileSync(join(here, 'actions.ts'), 'utf8')
const protocolSrc = readFileSync(join(here, '../../../protocol/claim.ts'), 'utf8')
const appSrc = readFileSync(join(here, '../App.tsx'), 'utf8')

const HOLDER = `02${'ab'.repeat(32)}`
const OTHER = `03${'cd'.repeat(32)}`

describe('mint price', () => {
  it('stores a whole sat price without a dollar face', () => {
    expect(mintPriceSats({ priceSats: 100 })).toBe(100)
    expect(formatSats(100)).toBe('100 sats')
    expect(formatSats(1)).toBe('1 sat')
    expect(formatSats(100)).not.toMatch(/\$0\.00/)
    expect(formatSats(100)).not.toMatch(/APY/)
  })

  it('requires a label, an item, and a whole sat price', () => {
    expect(() => assertCanMint({
      label: '',
      itemSerial: '25-0147',
      itemHashNote: '',
      priceSats: 100
    })).toThrow('Label is required.')
    expect(() => assertCanMint({
      label: 'Jordan 1986 Fleer',
      itemSerial: '   ',
      itemHashNote: '',
      priceSats: 100
    })).toThrow('Write the item or serial.')
    expect(() => assertCanMint({
      label: 'Jordan 1986 Fleer',
      itemSerial: '25-0147',
      itemHashNote: '',
      priceSats: 0
    })).toThrow('price must be at least 1 sat')
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

  it('rejects a second live claim for the same issuer serial', () => {
    expect(() => assertSerialFree([{
      issuer: HOLDER,
      itemSerial: '25-0147',
      claimId: 'aa'
    } as never], HOLDER, '25-0147')).toThrow(SERIAL_TAKEN)
  })
})

describe('deterministic vault claim', () => {
  it('encodes one serial per claim and burns on redeem', () => {
    expect(protocolSrc).toContain("kind: 'claim'")
    expect(protocolSrc).toContain("kind: 'redeem'")
    expect(protocolSrc).toContain('itemSerial')
    expect(protocolSrc).not.toMatch(/gacha|random pack|mystery/i)
    expect(actionsSrc).toContain('resolveItemHash')
    expect(actionsSrc).toContain('TRANSFER_SATS')
    expect(actionsSrc).toContain('satoshis: TRANSFER_SATS')
    expect(actionsSrc).toContain('redeemClaim')
    expect(TRANSFER_SATS).toBe(1)
    expect(actionsSrc).not.toMatch(/yield|APY|USDC|gacha/)
    expect(appSrc).not.toContain('row.holder}')
    expect(appSrc).toContain('runRedeem')
  })
})
