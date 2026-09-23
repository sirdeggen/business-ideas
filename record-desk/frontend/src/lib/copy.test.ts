import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ADVANCED_GATE,
  BANNER,
  BUSINESS_CASE_CITATIONS,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
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

describe('Business case page copy is locked', () => {
  it('uses the exact title and five fields in PATTERN order', () => {
    expect(BUSINESS_CASE_TITLE).toBe('Business case')
    expect([...BUSINESS_CASE_FIELDS]).toEqual([
      'Why it exists',
      'Who pays',
      'Market signal',
      'Proof people pay',
      'Demo goal'
    ])
  })

  it('keeps the locked bodies and does not dump Margaret or Sources', () => {
    expect(BUSINESS_CASE_WHY).toBe(
      'Someone posts a signed reading. Others who need that reading for downstream work pay a little to export a copy with the signature intact — publish once, pay to take it home, no unlimited free redistribution.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Primary: enterprise data/compliance/ops budgets paying per attributable export. Secondary: grassroots operators collecting export fees. A pay-to-export counter, not a terminal replacement.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'Pyth Pro: ~$2.43M cumulative gross revenue Sep 2025–Jul 2026; July 2026 alone ~$538K. Broader pay-to-export signed-reading TAM is unknown.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain analog: Pyth Pro — institutions pay subscriptions for signed market data delivery.'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: Bloomberg Terminal, Refinitiv, and AWS Data Exchange show enterprises pay for attributed data access and export.'
    )
    expect(BUSINESS_CASE_DEMO).toBe(
      'Post a signed reading → buyer pays a small fee → receives an export that still verifies the signature.'
    )
    const joined = [
      BUSINESS_CASE_WHY,
      BUSINESS_CASE_WHO,
      BUSINESS_CASE_MARKET,
      BUSINESS_CASE_PROOF_CHAIN,
      BUSINESS_CASE_PROOF_FIAT,
      BUSINESS_CASE_DEMO
    ].join('\n')
    expect(joined).not.toMatch(/Margaret/)
    expect(joined).not.toMatch(/## Sources/)
    expect(joined).not.toMatch(/Status:/)
  })

  it('offers at most three citation chips', () => {
    expect(BUSINESS_CASE_CITATIONS.length).toBeLessThanOrEqual(3)
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual([
      'Pyth Pro July 2026',
      'Pyth Marketplace'
    ])
  })

  it('sits once below the head and above the desk, with catalog still Server', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const app = readFileSync(resolve(here, '../App.tsx'), 'utf8')
    expect(app).toMatch(/<BusinessCase \/>/)
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const desk = app.indexOf('<section className="block">')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(desk).toBeGreaterThan(caseMark)

    const catalog = readFileSync(resolve(here, '../../../../pages/index.html'), 'utf8')
    const recordsStart = catalog.indexOf('demo-records')
    const recordsCard = catalog.slice(
      recordsStart,
      catalog.indexOf('</article>', recordsStart)
    )
    expect(recordsCard).toContain('<span class="badge">Server</span>')
    expect(recordsCard).toContain('Signed record desk')
    expect(recordsCard).not.toContain('Business case')
  })
})
