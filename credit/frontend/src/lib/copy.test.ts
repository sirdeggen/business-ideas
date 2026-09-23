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
  COLLATERAL_LINE,
  DEFAULT_BUTTON,
  DRAW_BUTTON,
  EYEBROW,
  FEE_STORY,
  FOOTER,
  LEDE,
  LIST_HEADING,
  PRIMARY_COPY,
  PRODUCT,
  REPAY_BUTTON,
  TERM_BUTTON,
  TITLE
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const businessCase = readFileSync(join(here, '../BusinessCase.tsx'), 'utf8')
const css = readFileSync(join(here, '../index.css'), 'utf8')
const html = readFileSync(join(here, '../../index.html'), 'utf8')
const readme = readFileSync(join(here, '../../../README.md'), 'utf8')
const rootReadme = readFileSync(join(here, '../../../../README.md'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const catalogCss = readFileSync(join(here, '../../../../pages/styles.css'), 'utf8')
const pagesYml = readFileSync(join(here, '../../../../.github/workflows/pages.yml'), 'utf8')
const cardStart = catalog.indexOf('href="./credit/"')
const creditCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const streamStart = catalog.indexOf('href="./streampay/"')
const streamCard = catalog.slice(streamStart, catalog.indexOf('</article>', streamStart))
const grantStart = catalog.indexOf('href="./grants/"')
const grantCard = catalog.slice(grantStart, catalog.indexOf('</article>', grantStart))
const liveStart = catalog.indexOf('<section class="spotlight"')
const liveSection = catalog.slice(liveStart, catalog.indexOf('</section>', liveStart))
const face = app.slice(0, app.indexOf('<details'))
const termFn = app.slice(app.indexOf('const runTerm'), app.indexOf('const runDraw'))
const drawFn = app.slice(app.indexOf('const runDraw'), app.indexOf('const runRepay'))
const repayFn = app.slice(app.indexOf('const runRepay'), app.indexOf('const runDefault'))
const checkFn = app.slice(app.indexOf('const runCheck'), app.indexOf('const runTerm'))

describe('first-paint copy', () => {
  it('names the desk and the job, not a protocol sentence', () => {
    expect(html).toContain('<title>Credit Desk</title>')
    expect(TITLE).toBe('Credit Desk')
    expect(PRODUCT).toBe('Credit Desk')
    expect(EYEBROW).toBe('Facility')
    expect(LEDE).toBe('Open a facility against an invoice or receivable. Draw. Repay. Flag default.')
    expect(TERM_BUTTON).toBe('Term')
    expect(DRAW_BUTTON).toBe('Draw')
    expect(REPAY_BUTTON).toBe('Repay')
    expect(DEFAULT_BUTTON).toBe('Default')
    expect(LIST_HEADING).toBe('Facilities')
    expect(app).toContain('{LEDE}')
    expect(app).toContain('{LIST_HEADING}')
    expect(app).toContain('TERM_BUTTON')
    expect(app).toContain('DRAW_BUTTON')
    expect(app).toContain('REPAY_BUTTON')
    expect(app).toContain('DEFAULT_BUTTON')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('DeFi')
    expect(app).not.toContain('yield')
    expect(app).not.toContain('USDC')
    expect(app).not.toContain('Solana')
    expect(app).not.toContain('Stripe')
    expect(app).not.toContain('x402')
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect')
    expect(app).not.toContain('connect wallet')
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Live')
    expect(app).not.toContain('Open UI')
    expect(creditCard).toContain('class="badge">Server<')
    expect(creditCard).toContain('>View<')
    expect(creditCard).not.toContain('Live')
    expect(creditCard).not.toContain('Open UI')
    expect(liveSection).toContain('href="./streampay/"')
    expect(liveSection).toContain('href="./grants/"')
    expect(liveSection).not.toContain('href="./credit/"')
  })

  it('calls out the desk fee and the underwriting write fee, and keeps sats under Advanced', () => {
    expect(FEE_STORY).toContain('50 bps')
    expect(FEE_STORY).toContain('underwriting write fee')
    expect(COLLATERAL_LINE).toContain('does not issue')
    expect(face).toContain('{FEE_STORY}')
    expect(face).toContain('{COLLATERAL_LINE}')
    expect(face).toContain('htmlFor="collateral"')
    expect(face).not.toContain('sats')
    expect(face).not.toContain('Identity key')
    expect(app).toContain('<summary>Advanced</summary>')
    expect(app).toContain('Amounts are in sats.')
    expect(FOOTER).toContain('Not a bank')
    expect(FOOTER).toContain('Not a lending market')
    expect(FOOTER).not.toMatch(/yield/i)
  })

  it('asks the wallet only on Term, Draw, Repay, and Default', () => {
    expect(checkFn).not.toContain('ensureWallet')
    expect(checkFn).not.toContain('connect()')
    expect(termFn.indexOf('assertCanTerm')).toBeLessThan(termFn.indexOf('ensureWallet'))
    expect(drawFn.indexOf('assertCanDraw')).toBeLessThan(drawFn.indexOf('ensureWallet'))
    expect(repayFn.indexOf('assertCanRepay')).toBeLessThan(repayFn.indexOf('ensureWallet'))
    expect(app).toContain('const session = await ensureWallet()')
    expect(app.split('const session = await ensureWallet()')).toHaveLength(5)
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('const showDraw')
    expect(app).toContain('const showRepay')
    expect(app).toContain('const showDefault')
  })

  it('stays a private credit facility, not a bank or a rebuilt invoice desk', () => {
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/\bLive\b/)
      expect(line).not.toMatch(/DeFi/i)
      expect(line).not.toMatch(/yield farm/i)
      expect(line).not.toMatch(/\bsats?\b/i)
    }
    expect(readme).toContain('does not issue invoices')
    expect(readme).toContain('MAGIC `credit`')
    expect(readme).toContain('Server')
    expect(readme).toContain('Not Live')
  })

  it('keeps the catalog card Server + View', () => {
    expect(creditCard).toContain('Credit Desk')
    expect(creditCard).toContain(LEDE)
    expect(creditCard).toContain('credit/README.md')
    expect(creditCard).toContain('scenes/credit.webp')
    expect(creditCard).toContain('class="badge">Server<')
    expect(creditCard).toContain('>View<')
    expect(creditCard).not.toContain('sats')
    expect(creditCard).not.toContain('Live')
    expect(readme).toContain('# Credit Desk (v0)')
    expect(rootReadme).toContain('## Credit Desk')
    expect(rootReadme).toContain('./credit/README.md')
    expect(readme).toContain('?c=<facilityId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toContain('pathname.match')
  })

  it('leaves StreamPay and Grant receipt Live and keeps neighbor desks', () => {
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(catalog).toContain('href="./invoices/"')
    expect(catalog).toContain('href="./receivables/"')
    expect(catalog).toContain('href="./handoff/"')
    expect(catalog).toContain('href="./vouch/"')
    expect(catalog).toContain('>Handoff Desk<')
  })

  it('is paper and navy, and wires Pages without dropping other desks', () => {
    expect(css).toContain('--paper:')
    expect(css).toContain('--navy:')
    expect(css).toContain('#1f3a5f')
    expect(css).toContain('Source Serif 4')
    expect(catalogCss).toContain('.demo-credit')
    expect(catalogCss).toContain('.demo-handoff')
    expect(pagesYml).toContain('# credit-desk')
    expect(pagesYml).toContain('credit/frontend/package-lock.json')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/credit/')
    expect(pagesYml).toContain('site/credit')
    expect(pagesYml).toContain('handoff/frontend/package-lock.json')
    expect(pagesYml).toContain('site/handoff')
    expect(pagesYml).toContain('site/invoices')
    expect(pagesYml).toContain('site/receivables')
    expect(pagesYml.match(/^  deploy:/gm)).toHaveLength(1)
  })

  it('shows the facility feed before the term form', () => {
    const list = app.indexOf('{LIST_HEADING}')
    const termForm = app.indexOf('{TERM_JOB}')
    const install = app.indexOf('{showInstall &&')
    expect(list).toBeGreaterThan(-1)
    expect(termForm).toBeGreaterThan(list)
    expect(install).toBeGreaterThan(termForm)
  })
})

describe('Business case page copy is locked', () => {
  it('uses the five fields in order', () => {
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
    expect(why).toBeGreaterThan(-1)
    expect(who).toBeGreaterThan(why)
    expect(market).toBeGreaterThan(who)
    expect(proof).toBeGreaterThan(market)
    expect(demo).toBeGreaterThan(proof)
  })

  it('keeps analog fees honest and off other-chain rails', () => {
    expect(BUSINESS_CASE_WHY).toContain('invoices and receivables')
    expect(BUSINESS_CASE_WHO).toContain('basis points')
    expect(BUSINESS_CASE_WHO).toContain('underwriting write fee')
    expect(BUSINESS_CASE_MARKET).toContain('$1.2M')
    expect(BUSINESS_CASE_MARKET).toContain('$462k')
    expect(BUSINESS_CASE_MARKET).toContain('321')
    expect(BUSINESS_CASE_MARKET).toContain('not those rails')
    expect(BUSINESS_CASE_PROOF_CHAIN).toContain('Maple')
    expect(BUSINESS_CASE_PROOF_FIAT).toContain('Fasanara')
    expect(BUSINESS_CASE_DEMO).toContain('flag default')
    const joined = [
      BUSINESS_CASE_WHY,
      BUSINESS_CASE_WHO,
      BUSINESS_CASE_MARKET,
      BUSINESS_CASE_PROOF_CHAIN,
      BUSINESS_CASE_PROOF_FIAT,
      BUSINESS_CASE_DEMO
    ].join('\n')
    expect(joined).not.toMatch(/DeFi/)
    expect(joined).not.toMatch(/yield/)
    expect(joined).not.toMatch(/USDC/)
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual([
      'DefiLlama Maple',
      'DefiLlama Centrifuge'
    ])
    expect(BUSINESS_CASE_CITATIONS.length).toBeLessThanOrEqual(3)
  })

  it('sits once below the head and above the desk', () => {
    expect(app).toMatch(/!facilityId && <BusinessCase \/>/)
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const list = app.indexOf('{LIST_HEADING}')
    expect(caseMark).toBeGreaterThan(head)
    expect(list).toBeGreaterThan(caseMark)
    expect(creditCard).not.toContain('Business case')
    expect(creditCard).toContain('class="badge">Server<')
  })
})
