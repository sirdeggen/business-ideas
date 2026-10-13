import { describe, expect, it } from 'vitest'
import { assertCanOpen, parseWhole } from './actions'

describe('open form', () => {
  it('accepts a fixed edition and the default fees before any wallet call', () => {
    expect(parseWhole('1,000')).toBe(1_000)
    expect(parseWhole('')).toBeNull()
    const ready = assertCanOpen({
      orgName: 'North Hall Volunteers',
      title: 'Founding Volunteer 2026',
      editionSize: 500,
      mintFeeSats: 1_000,
      royaltyBps: 500,
      deskBps: 200
    })
    expect(ready.title).toBe('Founding Volunteer 2026')
    expect(ready.editionSize).toBe(500)
    expect(ready.deskBps).toBe(200)
  })

  it('refuses a desk cut of 5% or more before a wallet exists', () => {
    expect(() => assertCanOpen({
      orgName: 'North Hall Volunteers',
      title: 'Founding Volunteer 2026',
      editionSize: 500,
      mintFeeSats: 1_000,
      royaltyBps: 500,
      deskBps: 500
    })).toThrow(/under 5%/)
  })
})
