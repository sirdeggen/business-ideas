import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BUSINESS_CASE_CITATIONS,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
  BUY_BUTTON,
  EMPTY_LIST,
  FOOTER,
  LEDE,
  POST_BUTTON,
  POST_JOB,
  PRIMARY_COPY,
  STALL_HEADING,
  TITLE
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const cardStart = catalog.indexOf('href="./datasets/"')
const datasetCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))

describe('first-paint copy', () => {
  it('names the stall and the job, not a protocol sentence', () => {
    expect(TITLE).toBe('Dataset stall')
    expect(STALL_HEADING).toBe('The stall')
    expect(LEDE).toBe('Post a listing. Pay a little to take the file.')
    expect(BUY_BUTTON).toBe('Get the file.')
    expect(POST_BUTTON).toBe('Post a listing')
    expect(POST_JOB).toBe('Title, license, the file, and a price.')
    expect(EMPTY_LIST).toBe('No listings yet.')
    expect(FOOTER).toBe('Not a radio network. Not a crawler paywall.')
    expect(app).toContain('{STALL_HEADING}')
    expect(app).toContain('License')
    expect(app).toContain('htmlFor="price">Price<')
    expect(app).toContain('BUY_BUTTON')
    expect(app).toContain('POST_BUTTON')
    expect(app).not.toContain('Price (sats)')
    expect(app).not.toContain('price in sats')
    expect(app).not.toContain('sample hash, sats')
    expect(app).not.toContain('Paid 100')
    expect(app).not.toContain('formatSats')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
  })

  it('is a catalog for labs, not Grass radios or a crawler paywall', () => {
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/DePIN/i)
      expect(line).not.toMatch(/USDC/i)
      expect(line).not.toMatch(/APY/i)
      expect(line).not.toMatch(/\$0\.00/)
      expect(line).not.toMatch(/\bLive\b/)
      expect(line).not.toMatch(/\bsats?\b/i)
    }
    expect(FOOTER).toMatch(/Not a radio network/)
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Connecting…')
    expect(app).not.toContain('identity key')
    expect(app).not.toContain('{identityKey}')
    expect(app).not.toMatch(/DePIN/)
    expect(app).not.toMatch(/USDC/)
    expect(app).not.toMatch(/APY/)
    expect(app).not.toMatch(/\$0\.00/)
    expect(app).not.toMatch(/node operator/i)
    expect(app).not.toMatch(/\bradios?\b/i)
  })

  it('keeps sample hash under Advanced, not on the listing face', () => {
    expect(app).toContain('<summary>Advanced</summary>')
    expect(app).toContain('Sample hash')
    expect(app.indexOf('<h3>{row.title}</h3>')).toBeLessThan(app.indexOf('{row.license}'))
    expect(app).toContain('BUY_BUTTON')
    expect(app).not.toContain('{formatSats(row.priceSats)}')
    expect(app).not.toContain('{formatSats(receipt.paidSats)}')
    expect(app).not.toContain('row.dump')
  })

  it('shows the stall list before wallet chrome', () => {
    const stall = app.indexOf('{STALL_HEADING}')
    const post = app.indexOf('{POST_HEADING}')
    const install = app.indexOf('{showInstall &&')
    expect(stall).toBeGreaterThan(-1)
    expect(post).toBeGreaterThan(stall)
    expect(install).toBeGreaterThan(post)
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).not.toContain('Boolean(combinedError) && !overlayDown')
    expect(app).toContain('isWalletMissing')
    expect(app).toContain('Install BSV Desktop')
  })

  it('keeps the catalog card Server + View, not Open UI or Live', () => {
    expect(datasetCard).toContain('class="badge">Server<')
    expect(datasetCard).toContain('>View<')
    expect(datasetCard).toContain('How to run')
    expect(datasetCard).toContain('Post a listing. Pay a little to take the file.')
    expect(datasetCard).not.toContain('sample hash')
    expect(datasetCard).not.toContain('sats')
    expect(datasetCard).not.toContain('Open UI')
    expect(datasetCard).not.toContain('soon')
    expect(datasetCard).not.toContain('Live')
    expect(datasetCard).not.toContain('radio')
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
      'Sellers of files and dumps need a stall: list title, license, and price; keep the bytes off the public row; unlock the file only after pay. Buyers (labs, analysts) want a sample hash and a receipt — not another free scrape wall or API key negotiation.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Primary GTM — buyers: AI labs and analysts who pay per dump for licensed training, web, or curated data. Secondary — sellers: data brokers and indie curators who list (listing fee and/or take rate on unlock). GTM leads with lab/analyst buyers.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'Grass (official Jul 2026 holder call): $17M revenue in 2025; ~$17M in H1 2026 alone; full-year 2026 training-data outlook ~$65–75M. Non-chain data marketplaces (AWS Data Exchange, Bright Data, and peers) exist; public stall-level GMV for “pay-for-dump” catalogs is unknown beyond named sellers.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain analog: Grass — AI labs already pay for ethically sourced web/training data collected via a distributed network; disclosed multi-million revenue.'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: AWS Data Exchange / commercial data brokers and dataset marketplaces — enterprises buy licensed dumps and feeds with invoices, not free torrents.'
    )
    expect(BUSINESS_CASE_DEMO).toBe(
      'Post a listing (title, license, sample hash, price) → lab pays → file arrives privately → receipt on the public stall. Catalog readable with no wallet.'
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
      'Grass Jul 2026',
      'AWS Data Exchange'
    ])
  })

  it('sits once below the head and above the desk, with catalog still Server', () => {
    expect(app).toMatch(/<BusinessCase \/>/)
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const stall = app.indexOf('{STALL_HEADING}')
    const post = app.indexOf('{POST_HEADING}')
    const install = app.indexOf('{showInstall &&')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(stall).toBeGreaterThan(caseMark)
    expect(post).toBeGreaterThan(stall)
    expect(install).toBeGreaterThan(post)

    expect(datasetCard).toContain('class="badge">Server<')
    expect(datasetCard).toContain('Dataset stall')
    expect(datasetCard).not.toContain('Business case')
  })
})
