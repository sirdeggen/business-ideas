import { describe, expect, it } from 'vitest'
import {
  ADVANCED_GATE,
  BANNER,
  EMPTY_LIST,
  EXPORT_BUTTON,
  EXPORT_HEADING,
  FOOTER,
  LEDE,
  PRIMARY_COPY
} from './copy'

describe('signed record desk first-paint copy', () => {
  it('uses buyer words on the primary surface', () => {
    expect(EXPORT_HEADING).toBe('Export a reading')
    expect(EXPORT_BUTTON).toBe('Pay a little + Export')
    expect(EMPTY_LIST).toBe('No signed records yet — post one.')
    expect(LEDE).toBe('Post a signed reading. Pay a little to export.')
    expect(BANNER).toMatch(/Hashes are listed for free/)
    expect(BANNER).toMatch(/Wallet is only asked when you Post or Pay/)
    expect(FOOTER).toBe('Not tickets, not invoices, not a stamp card.')
  })

  it('keeps dump and sats off the primary', () => {
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/dump/i)
      expect(line).not.toMatch(/buy a dump/i)
      expect(line).not.toMatch(/\bsats?\b/i)
    }
  })

  it('keeps the overlay gate line for Advanced', () => {
    expect(ADVANCED_GATE).toMatch(/overlay already holds the fields/i)
    expect(ADVANCED_GATE).toMatch(/payment is the gate/i)
  })
})
