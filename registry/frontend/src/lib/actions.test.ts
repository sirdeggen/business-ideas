import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { TRANSFER_FEE_SATS } from '../../../protocol/registry'
import { assertCanCreate, assertCanIssue, assertCanTransfer } from './actions'
import { NEED_HOLDER, NOT_ADMIN, NOT_ENOUGH } from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const actionsSrc = readFileSync(join(here, 'actions.ts'), 'utf8')

const ADMIN = `02${'ab'.repeat(32)}`
const HOLDER = `03${'cd'.repeat(32)}`
const OTHER = `02${'ef'.repeat(32)}`

const register = {
  admin: ADMIN,
  totalUnits: 100 as number | null
}

describe('create / issue / transfer gates', () => {
  it('names the register and optional total', () => {
    expect(assertCanCreate({
      name: ' HOA unit ledger ',
      unitLabel: ' lots ',
      totalUnits: '',
      aumNote: ' 48 lots '
    })).toEqual({
      name: 'HOA unit ledger',
      unitLabel: 'lots',
      totalUnits: null,
      aumNote: '48 lots'
    })
    expect(() => assertCanCreate({
      name: '',
      unitLabel: 'units',
      totalUnits: '',
      aumNote: ''
    })).toThrow('Register name is required.')
  })

  it('lets only the admin issue to an identity key or share link', () => {
    expect(assertCanIssue(register, ADMIN, {
      holder: `https://desk.test/?k=${HOLDER}`,
      units: '12'
    }, 0)).toEqual({ holder: HOLDER, units: 12 })
    expect(() => assertCanIssue(register, HOLDER, { holder: HOLDER, units: '1' }, 0)).toThrow(NOT_ADMIN)
    expect(() => assertCanIssue(register, ADMIN, { holder: 'nope', units: '1' }, 0)).toThrow(NEED_HOLDER)
    expect(() => assertCanIssue(register, ADMIN, { holder: HOLDER, units: '11' }, 90)).toThrow(
      'That issue would pass the register total.'
    )
  })

  it('charges the protocol fee and refuses an uncovered transfer', () => {
    const holdings = [{ holder: HOLDER, units: 10 }]
    expect(assertCanTransfer(register, holdings, HOLDER, {
      from: '',
      to: OTHER,
      units: '4'
    })).toEqual({
      from: HOLDER,
      to: OTHER,
      units: 4,
      protocolFeeSats: TRANSFER_FEE_SATS
    })
    expect(() => assertCanTransfer(register, holdings, HOLDER, {
      from: '',
      to: OTHER,
      units: '11'
    })).toThrow(NOT_ENOUGH)
    expect(() => assertCanTransfer(register, holdings, OTHER, {
      from: HOLDER,
      to: OTHER,
      units: '1'
    })).toThrow('Only the admin can move another holder’s units.')
    expect(assertCanTransfer(register, holdings, ADMIN, {
      from: HOLDER,
      to: OTHER,
      units: '1'
    }).protocolFeeSats).toBe(TRANSFER_FEE_SATS)
  })
})

describe('createAction rails', () => {
  it('posts the register, the issue, and a labeled transfer protocol fee', () => {
    expect(actionsSrc).toContain('wallet.createAction')
    expect(actionsSrc).toContain("tags: [BASKET, 'register', registerId]")
    expect(actionsSrc).toContain("tags: [BASKET, 'issue', register.registerId]")
    expect(actionsSrc).toContain("tags: [BASKET, 'transfer', register.registerId]")
    expect(actionsSrc).toContain('outputDescription: `Registry protocol fee for ${register.name}`')
    expect(actionsSrc).toContain('satoshis: ready.protocolFeeSats')
    expect(actionsSrc).toContain('satoshis: ATTEST_SATS')
    expect(actionsSrc).not.toContain('AUM_SUBSCRIPTION_SATS')
  })

  it('exports a reading without asking the wallet', () => {
    const exportFn = actionsSrc.slice(actionsSrc.indexOf('export function downloadReading'))
    expect(exportFn).toContain('buildReading')
    expect(exportFn).not.toContain('wallet')
    expect(exportFn).not.toContain('createAction')
  })
})
