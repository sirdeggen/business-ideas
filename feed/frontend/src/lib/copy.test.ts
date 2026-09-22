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
  EMPTY_LIST,
  EYEBROW,
  FOOTER,
  LEDE,
  LIST_HEADING,
  PAID_LINE,
  POST_BUTTON,
  POST_JOB,
  PRIMARY_COPY,
  QUERY_BUTTON,
  RECEIPT_HEADING,
  TITLE,
  receiptFace
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const businessCase = readFileSync(join(here, '../BusinessCase.tsx'), 'utf8')
const css = readFileSync(join(here, '../index.css'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const pagesYml = readFileSync(join(here, '../../../../.github/workflows/pages.yml'), 'utf8')
const cardStart = catalog.indexOf('href="./feed/"')
const feedCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const face = app.slice(0, app.indexOf('<details'))
const advanced = app.slice(app.indexOf('<details'))

describe('first-paint copy', () => {
  it('names the desk and the job', () => {
    expect(TITLE).toBe('Feed Desk')
    expect(EYEBROW).toBe('Desk')
    expect(LEDE).toBe('Sell a feed. Buy a fresh signed reading.')
    expect(LIST_HEADING).toBe('Feeds')
    expect(EMPTY_LIST).toBe('No feeds yet.')
    expect(QUERY_BUTTON).toBe('Query')
    expect(POST_BUTTON).toBe('Publish')
    expect(POST_JOB).toBe('A label, a metric, a fresh reading, and a price.')
    expect(FOOTER).toBe('Not a registration receipt. Not a dump export.')
    expect(app).toContain('{LEDE}')
    expect(app).toContain('{LIST_HEADING}')
    expect(face).toContain('htmlFor="price">Price<')
    expect(face).toContain('htmlFor="subscription">Subscription<')
    expect(face).not.toContain('Price (sats)')
    expect(face).not.toContain('sats')
    expect(face).not.toContain('formatSats')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('Live')
    expect(app).not.toContain('Open UI')
    expect(app).not.toContain('Connect wallet')
  })

  it('keeps protocol detail under Advanced', () => {
    expect(advanced).toContain('<summary>Advanced</summary>')
    expect(advanced).toContain('{AMOUNTS_LINE}')
    expect(advanced).toContain('htmlFor="hours"')
    expect(advanced).toContain('shortKey(identityKey')
    expect(advanced).toContain('Reading hash')
    expect(face).not.toContain('Reading hash')
    expect(face).not.toContain('Wallet key')
  })

  it('names a receipt by the reading', () => {
    expect(RECEIPT_HEADING).toBe('Receipt')
    expect(PAID_LINE).toBe('Paid')
    expect(receiptFace({
      label: 'Gold spot',
      value: '2431.50',
      unit: 'USD/oz',
      covered: false
    })).toBe('Gold spot\n2431.50 USD/oz\nPaid')
    expect(receiptFace({
      label: 'Gold spot',
      value: '2431.50',
      unit: 'USD/oz',
      covered: true
    })).not.toMatch(/sat/i)
    expect(face).toContain('{receipt.label}')
    expect(face).toContain('{receipt.valueLine}')
    expect(face).toContain('PAID_LINE')
    expect(face).not.toContain('Paid 100')
  })

  it('shows feeds before publish and wallet chrome', () => {
    const list = app.indexOf('{LIST_HEADING}')
    const post = app.indexOf('{POST_HEADING}')
    const install = app.indexOf('{showInstall &&')
    expect(list).toBeGreaterThan(-1)
    expect(post).toBeGreaterThan(list)
    expect(install).toBeGreaterThan(post)
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).toContain('Install BSV Desktop')
  })

  it('keeps primary copy free of sats theatre and a Live badge', () => {
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/\bsats?\b/i)
      expect(line).not.toMatch(/\bLive\b/)
      expect(line).not.toMatch(/\$0\.00/)
      expect(line).not.toMatch(/USDC/i)
    }
    expect(css).not.toContain('#f7f5f2')
    expect(css).toContain('--lime')
  })

  it('keeps the catalog card Server + View, and Pages still builds the other desks', () => {
    expect(feedCard).toContain('class="badge">Server<')
    expect(feedCard).toContain('>View<')
    expect(feedCard).toContain('How to run')
    expect(feedCard).toContain('Sell a feed. Buy a fresh signed reading.')
    expect(feedCard).not.toContain('Open UI')
    expect(feedCard).not.toContain('Live')
    expect(feedCard).not.toContain('sats')
    expect(pagesYml).toContain('feed/frontend/package-lock.json')
    expect(pagesYml).toContain('site/feed')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/feed/')
    expect(pagesYml).toContain('site/records')
    expect(pagesYml).toContain('site/trace')
    expect(pagesYml).toContain('site/streampay')
    expect(pagesYml).toContain('site/grants')
    expect(pagesYml).toContain('site/handoff')
    expect(pagesYml).toContain('site/credit')
    expect(pagesYml).toContain('site/registry')
    expect(pagesYml).toContain('site/handoff site/credit site/registry site/scenes')
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'feed', 'scenes'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
  })
})

describe('Business case page copy is locked', () => {
  it('uses the exact title and five fields in order', () => {
    expect(BUSINESS_CASE_TITLE).toBe('Business case')
    expect([...BUSINESS_CASE_FIELDS]).toEqual([
      'Why it exists',
      'Who pays',
      'Market signal',
      'Proof people pay',
      'Demo goal'
    ])
    const why = businessCase.indexOf('<dt>Why it exists</dt>')
    const who = businessCase.indexOf('<dt>Who pays</dt>')
    const market = businessCase.indexOf('<dt>Market signal</dt>')
    const proof = businessCase.indexOf('<dt>Proof people pay</dt>')
    const demo = businessCase.indexOf('<dt>Demo goal</dt>')
    expect(who).toBeGreaterThan(why)
    expect(market).toBeGreaterThan(who)
    expect(proof).toBeGreaterThan(market)
    expect(demo).toBeGreaterThan(proof)
  })

  it('keeps the locked bodies', () => {
    expect(BUSINESS_CASE_WHY).toContain('signed reading')
    expect(BUSINESS_CASE_WHY).toContain('not a provenance registration')
    expect(BUSINESS_CASE_WHY).toContain('not a paid dump')
    expect(BUSINESS_CASE_WHO).toContain('per query')
    expect(BUSINESS_CASE_MARKET).toContain('$434k')
    expect(BUSINESS_CASE_MARKET).toContain('project-reported')
    expect(BUSINESS_CASE_PROOF_CHAIN).toContain('Pyth Pro')
    expect(BUSINESS_CASE_PROOF_FIAT).toContain('market-data')
    expect(BUSINESS_CASE_DEMO).toBe(
      'Publish a feed. A guest reads the list with no wallet. Pay per query or subscribe. The receipt names the reading.'
    )
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual([
      'DefiLlama Pyth Pro',
      'Pyth'
    ])
    const joined = [
      BUSINESS_CASE_WHY,
      BUSINESS_CASE_WHO,
      BUSINESS_CASE_MARKET,
      BUSINESS_CASE_PROOF_CHAIN,
      BUSINESS_CASE_PROOF_FIAT,
      BUSINESS_CASE_DEMO
    ].join('\n')
    expect(joined).not.toMatch(/Margaret/)
    expect(joined).not.toMatch(/\bLive\b/)
  })

  it('sits once below the head and above the feed list', () => {
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const list = app.indexOf('{LIST_HEADING}')
    expect(caseMark).toBeGreaterThan(head)
    expect(list).toBeGreaterThan(caseMark)
    expect(feedCard).not.toContain('Business case')
  })
})
