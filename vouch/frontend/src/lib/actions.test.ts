import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_BOND_SATS, FEE_SATS } from '../../../protocol/vouch'
import {
  assertCanAttest,
  assertCanReleaseBond,
  assertCanSlash,
  assertCanVouch,
  defaultBondSats,
  writeFeeSats
} from './actions'
import { BOND_NOT_LIVE, NOT_SLASHER, NOT_VOUCHER } from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const actionsSrc = readFileSync(join(here, 'actions.ts'), 'utf8')
const protocolSrc = readFileSync(join(here, '../../../protocol/vouch.ts'), 'utf8')

const VOUCHER = `02${'ab'.repeat(32)}`
const SLASHER = `03${'cd'.repeat(32)}`
const OTHER = `02${'ef'.repeat(32)}`

describe('write fee and bond', () => {
  it('pays a small write fee on vouch and attest', () => {
    expect(writeFeeSats()).toBe(FEE_SATS)
    expect(defaultBondSats()).toBe(DEFAULT_BOND_SATS)
    expect(FEE_SATS).toBe(100_000)
    expect(actionsSrc).toContain('satoshis: FEE_SATS')
    expect(actionsSrc).toContain('p2pkhFromPublicKey')
    expect(actionsSrc).toContain('stakeVouch')
    expect(actionsSrc).toContain('attestVouch')
  })

  it('requires a label, a supplier, and a whole sat bond', () => {
    expect(assertCanVouch({
      label: 'Harbor steel',
      subject: 'North Mill',
      subjectIdentity: '',
      slasher: '',
      bondSats: DEFAULT_BOND_SATS
    })).toEqual({
      label: 'Harbor steel',
      subject: 'North Mill',
      subjectIdentity: '',
      slasher: '',
      bondSats: DEFAULT_BOND_SATS
    })
    expect(() => assertCanVouch({
      label: '',
      subject: 'North Mill',
      subjectIdentity: '',
      slasher: '',
      bondSats: DEFAULT_BOND_SATS
    })).toThrow('Label is required.')
    expect(() => assertCanVouch({
      label: 'Harbor steel',
      subject: '   ',
      subjectIdentity: '',
      slasher: '',
      bondSats: DEFAULT_BOND_SATS
    })).toThrow('Name the supplier.')
    expect(() => assertCanVouch({
      label: 'Harbor steel',
      subject: 'North Mill',
      subjectIdentity: '',
      slasher: '',
      bondSats: 0
    })).toThrow('Bond must be at least 1 sat.')
  })

  it('requires a vouch and a note before attest', () => {
    expect(assertCanAttest({
      vouchId: 'A1B2C3D4E5F67890',
      note: '  Checked incorporation. '
    })).toEqual({
      vouchId: 'a1b2c3d4e5f67890',
      note: 'Checked incorporation.'
    })
    expect(() => assertCanAttest({ vouchId: '', note: 'Checked.' }))
      .toThrow('Look up a vouch first.')
    expect(() => assertCanAttest({ vouchId: 'a1b2c3d4e5f67890', note: '' }))
      .toThrow('Say what was checked.')
  })
})

describe('slash and release gates', () => {
  const live = {
    voucher: VOUCHER,
    slasher: SLASHER,
    vouchId: 'a1b2c3d4e5f67890',
    timestamp: '2026-09-15T12:00:00Z'
  }

  it('lets the voucher or designated slasher slash a live bond', () => {
    expect(() => assertCanSlash(live, VOUCHER)).not.toThrow()
    expect(() => assertCanSlash(live, SLASHER)).not.toThrow()
    expect(() => assertCanSlash(live, OTHER)).toThrow(NOT_SLASHER)
    expect(() => assertCanSlash(live, VOUCHER, [{
      vouchId: live.vouchId,
      timestamp: '2026-09-15T14:00:00Z'
    }])).toThrow(BOND_NOT_LIVE)
  })

  it('lets only the voucher release a live bond', () => {
    expect(() => assertCanReleaseBond(live, VOUCHER)).not.toThrow()
    expect(() => assertCanReleaseBond(live, SLASHER)).toThrow(NOT_VOUCHER)
    expect(() => assertCanReleaseBond(live, VOUCHER, [{
      vouchId: live.vouchId,
      timestamp: '2026-09-15T14:00:00Z'
    }])).toThrow(BOND_NOT_LIVE)
  })
})

describe('not a trading market', () => {
  it('encodes vouch, attest, slash, and release — no order book', () => {
    expect(protocolSrc).toContain("kind: 'vouch'")
    expect(protocolSrc).toContain("kind: 'attest'")
    expect(protocolSrc).toContain("kind: 'slash'")
    expect(protocolSrc).toContain("kind: 'release'")
    expect(protocolSrc).toContain("MAGIC = 'vouch'")
    expect(protocolSrc).toContain('currentVouches')
    expect(protocolSrc).toContain('liveBond')
    expect(protocolSrc).not.toMatch(/order book|orderbook|APY|USDC/i)
    expect(actionsSrc).not.toMatch(/yield|APY|USDC|order book/)
  })
})
