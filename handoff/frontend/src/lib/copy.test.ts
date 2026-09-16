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
  CONFIRM_BUTTON,
  CONFIRMING_BUTTON,
  EYEBROW,
  FEE_STORY,
  FOOTER,
  FUND_BUTTON,
  FUNDING_BUTTON,
  LEDE,
  LIST_BUTTON,
  LIST_HEADING,
  LISTING_BUTTON,
  PRIMARY_COPY,
  PRODUCT,
  RELEASE_BUTTON,
  RELEASING_BUTTON,
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
const cardStart = catalog.indexOf('href="./handoff/"')
const handoffCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const streamStart = catalog.indexOf('href="./streampay/"')
const streamCard = catalog.slice(streamStart, catalog.indexOf('</article>', streamStart))
const grantStart = catalog.indexOf('href="./grants/"')
const grantCard = catalog.slice(grantStart, catalog.indexOf('</article>', grantStart))
const face = app.slice(0, app.indexOf('<details'))
const advanced = app.slice(app.indexOf('<details'))
const listFn = app.slice(app.indexOf('const runList'), app.indexOf('const runFund'))
const fundFn = app.slice(app.indexOf('const runFund'), app.indexOf('const runConfirm'))
const confirmFn = app.slice(app.indexOf('const runConfirm'), app.indexOf('const runRelease'))
const releaseFn = app.slice(app.indexOf('const runRelease'), app.indexOf('const retry'))

describe('first-paint copy', () => {
  it('names the desk and the job, not a protocol sentence', () => {
    expect(html).toContain('<title>Handoff Desk</title>')
    expect(TITLE).toBe('Handoff Desk')
    expect(PRODUCT).toBe('Handoff Desk')
    expect(LEDE).toBe('List a digital asset. Fund escrow. Confirm the handoff. Release.')
    expect(LIST_BUTTON).toBe('List an asset')
    expect(FUND_BUTTON).toBe('Fund escrow')
    expect(CONFIRM_BUTTON).toBe('Confirm')
    expect(RELEASE_BUTTON).toBe('Release')
    expect(LISTING_BUTTON).toBe('Listing…')
    expect(FUNDING_BUTTON).toBe('Funding…')
    expect(CONFIRMING_BUTTON).toBe('Confirming…')
    expect(RELEASING_BUTTON).toBe('Releasing…')
    expect(LIST_HEADING).toBe('Listings')
    expect(app).toContain('{LEDE}')
    expect(app).toContain('{LIST_HEADING}')
    expect(app).toContain('LIST_BUTTON')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('GMV')
    expect(app).not.toContain('APA')
    expect(app).not.toContain('Escrow.com')
  })

  it('keeps one title and a quieter Studio eyebrow', () => {
    expect(EYEBROW).toBe('Studio')
    expect(app).toContain('className="eyebrow">{EYEBROW}<')
    expect(app).toContain('<h1>{TITLE}</h1>')
    expect(app).not.toContain('Connect hero')
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect')
    expect(app).not.toContain('connect wallet')
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Live')
    expect(app).not.toContain('Open UI')
    expect(handoffCard).toContain('class="badge">Server<')
    expect(handoffCard).toContain('>View<')
    expect(handoffCard).not.toContain('Live')
    expect(handoffCard).not.toContain('Open UI')
  })

  it('keeps sats and hex off the face; sats under Advanced', () => {
    expect(face).toContain('htmlFor="title">Title<')
    expect(face).toContain('htmlFor="type">Type<')
    expect(face).toContain('htmlFor="price">Price<')
    expect(face).not.toContain('Price (sats)')
    expect(face).not.toContain('price in sats')
    expect(face).not.toContain('sats')
    expect(face).not.toContain('Identity key')
    expect(face).not.toContain('02…')
    expect(face).not.toContain('03…')
    expect(face).not.toMatch(/\$\d/)
    expect(advanced).toContain('Amounts are in sats.')
    expect(advanced).toContain('Advanced')
    expect(advanced).toContain('shortKey(identityKey')
    expect(advanced).toContain('{FEE_STORY}')
    expect(FEE_STORY).toContain('1%')
    expect(FEE_STORY).not.toContain('GMV')
    expect(FEE_STORY).not.toContain('escrow account')
    expect(face).toContain('{FEE_STORY}')
  })

  it('uses Listing / Funding / Confirming / Releasing on busy primaries', () => {
    expect(app).toContain('busy === \'list\' ? LISTING_BUTTON : LIST_BUTTON')
    expect(app).toContain('busy === \'fund\' ? FUNDING_BUTTON : FUND_BUTTON')
    expect(app).toContain('busy === \'confirm\' ? CONFIRMING_BUTTON : CONFIRM_BUTTON')
    expect(app).toContain('busy === \'release\' ? RELEASING_BUTTON : RELEASE_BUTTON')
    for (const label of [
      LISTING_BUTTON, FUNDING_BUTTON, CONFIRMING_BUTTON, RELEASING_BUTTON,
      LIST_BUTTON, FUND_BUTTON, CONFIRM_BUTTON, RELEASE_BUTTON
    ]) {
      expect(label.toLowerCase()).not.toContain('wallet')
    }
    expect(face).not.toContain('Approve in your wallet')
    expect(face).not.toContain('Waiting for wallet')
    expect(face).not.toContain('Approve in wallet')
  })

  it('asks the wallet only on List, Fund, Confirm, and Release', () => {
    expect(listFn.indexOf('assertCanList')).toBeLessThan(listFn.indexOf('ensureWallet'))
    expect(fundFn.indexOf('ensureWallet')).toBeGreaterThan(-1)
    expect(confirmFn.indexOf('ensureWallet')).toBeGreaterThan(-1)
    expect(releaseFn.indexOf('ensureWallet')).toBeGreaterThan(-1)
    expect(app).toContain('const session = await ensureWallet()')
    expect(app.split('const session = await ensureWallet()')).toHaveLength(5)
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).toContain('isWalletMissing')
    expect(app).toContain('const showFund')
    expect(app).toContain('const showConfirm')
    expect(app).toContain('const showRelease')
    expect(app).not.toContain('Redeem')
    expect(app).not.toContain('Mint a claim')
    expect(app).not.toContain('Deliverable hash')
  })

  it('is digital ownership transfer, not vault claim or job escrow', () => {
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/gacha/i)
      expect(line).not.toMatch(/vaulted item/i)
      expect(line).not.toMatch(/burn it to redeem/i)
      expect(line).not.toMatch(/hash lands/i)
      expect(line).not.toMatch(/\bLive\b/)
      expect(line).not.toMatch(/\bsats?\b/i)
    }
    expect(FOOTER).toMatch(/Not Vault Claim/)
    expect(FOOTER).toMatch(/Not Job Escrow/)
    expect(FOOTER).toMatch(/Digital ownership transfer/)
  })

  it('keeps the catalog card Server + View, not Open UI or Live', () => {
    expect(handoffCard).toContain('<h2>')
    expect(handoffCard).toContain('Handoff Desk')
    expect(handoffCard).toContain('List a digital asset. Fund escrow. Confirm the handoff. Release.')
    expect(handoffCard).toContain('handoff/README.md')
    expect(handoffCard).toContain('class="badge">Server<')
    expect(handoffCard).toContain('>View<')
    expect(handoffCard).toContain('scenes/handoff.webp')
    expect(handoffCard).not.toContain('sats')
    expect(handoffCard).not.toContain('soon')
    expect(handoffCard).not.toContain('Live')
    expect(handoffCard).not.toContain('Open UI')
    expect(readme).toContain('# Handoff Desk (v0)')
    expect(rootReadme).toContain('## Handoff Desk\n')
    expect(html).toContain('<title>Handoff Desk</title>')
    expect(readme).toContain('?h=<listingId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/h\/:id/)
    expect(app).not.toContain('pathname.match')
  })

  it('leaves StreamPay and Grant receipt Live', () => {
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(streamCard).toContain('Pay as they work.')
    expect(grantCard).toContain('A gift for a purpose.')
  })

  it('is a violet studio desk, not paper-and-navy, brass vault, or yellow job ticket', () => {
    expect(css).toContain('--violet:')
    expect(css).toContain('--studio:')
    expect(css).toContain('--glass:')
    expect(css).toContain('Outfit')
    expect(css).not.toContain('#1f3a5f')
    expect(css).not.toContain('#1F3A5F')
    expect(css).not.toContain('--paper: #E4D6C3')
    expect(css).not.toContain('--brass:')
    expect(css).not.toContain('--ticket:')
    expect(css).not.toContain('--safety:')
    expect(catalogCss).toContain('.demo-handoff')
    expect(catalogCss).toContain('.demo-kya')
    expect(catalogCss).toContain('.demo-vouch')
    expect(catalogCss).toContain('--chip: #06b6d4')
    expect(pagesYml).toContain('handoff/frontend/package-lock.json')
    expect(pagesYml).toContain('site/handoff')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/handoff/')
    expect(pagesYml).toContain('vault-claim/frontend/package-lock.json')
    expect(pagesYml).toContain('site/vault-claim')
    expect(pagesYml).toContain('job-escrow/frontend/package-lock.json')
    expect(pagesYml).toContain('site/job-escrow')
    expect(pagesYml).toContain('kya/frontend/package-lock.json')
    expect(pagesYml).toContain('site/kya')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/kya/')
    expect(pagesYml).toContain('vouch/frontend/package-lock.json')
    expect(pagesYml).toContain('site/vouch')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/vouch/')
    expect(pagesYml.match(/^  deploy:/gm)).toHaveLength(1)
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'scenes'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
  })

  it('keeps neighbor catalog cards next to handoff', () => {
    expect(catalog).toContain('href="./tickets/"')
    expect(catalog).toContain('href="./titles/"')
    expect(catalog).toContain('href="./trace/"')
    expect(catalog).toContain('href="./job-escrow/"')
    expect(catalog).toContain('href="./vault-claim/"')
    expect(catalog).toContain('href="./kya/"')
    expect(catalog).toContain('href="./vouch/"')
    expect(catalog).toContain('href="./handoff/"')
    expect(catalog).toContain('src="./scenes/job-escrow.webp"')
    expect(catalog).toContain('src="./scenes/vault-claim.webp"')
    expect(catalog).toContain('src="./scenes/kya.webp"')
    expect(catalog).toContain('src="./scenes/vouch.webp"')
    expect(catalog).toContain('src="./scenes/handoff.webp"')
    expect(catalog).toContain('>Job escrow<')
    expect(catalog).toContain('>Vault Claim<')
    expect(catalog).toContain('>Know Your Agent<')
    expect(catalog).toContain('>Vouch Desk<')
    expect(catalog).toContain('>Handoff Desk<')
  })

  it('shows listings before the list form and wallet chrome', () => {
    const list = app.indexOf('{LIST_HEADING}')
    const listForm = app.indexOf('{LIST_JOB}')
    const install = app.indexOf('{showInstall &&')
    expect(list).toBeGreaterThan(-1)
    expect(listForm).toBeGreaterThan(list)
    expect(install).toBeGreaterThan(listForm)
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
    expect(businessCase).toContain('{BUSINESS_CASE_TITLE}')
    expect(businessCase).not.toContain('Margaret')
    expect(businessCase).not.toContain('## Sources')
  })

  it('keeps the locked bodies and does not dump Margaret or Sources', () => {
    expect(BUSINESS_CASE_WHY).toBe(
      'Two parties moving a digital asset need neither side to walk until both confirm — list, fund escrow, confirm, release. Clean handoff for domains, IP, or contract ownership — not a floor-price marketplace.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Sellers and buyers of controllable digital assets — domains, IP rights, and contract ownership (enterprise: finance and IP ops; grassroots: small teams doing OTC handoffs). Parties split or assign an escrow fee on the deal.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'L.A.U.R.A. Ownership Market / The Lab (Clutch Markets, Sep 2026 reporting): lists smart-contract ownership with escrow until payment, then transferOwnership — published take ~1%; completed sales volume at launch coverage was unknown / none yet reported. Escrow.com (public fee table): Standard fee 2.6% ($50 min) under $5K, stepping down to ~1.0% in the $1M–$3M band — people already pay mid-single-digit to ~1% for digital-asset and domain handoffs off-chain.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain analog: L.A.U.R.A. Ownership Market — on-chain ownership escrow at ~1% for contract handoffs.'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: Escrow.com digital goods / domain escrow — funded → inspected → released with a published percentage fee.'
    )
    expect(BUSINESS_CASE_DEMO).toBe(
      'Two parties complete a handoff on one URL with a clear funded → confirmed → released path.'
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
      'Clutch Markets, Sep 2026',
      'Escrow.com fees'
    ])
  })

  it('sits once below the head and above the desk, with catalog still Server', () => {
    expect(app).toMatch(/!listingId && <BusinessCase \/>/)
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const list = app.indexOf('{LIST_HEADING}')
    const listForm = app.indexOf('{LIST_JOB}')
    const install = app.indexOf('{showInstall &&')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(list).toBeGreaterThan(caseMark)
    expect(listForm).toBeGreaterThan(list)
    expect(install).toBeGreaterThan(listForm)

    expect(handoffCard).toContain('class="badge">Server<')
    expect(handoffCard).toContain('Handoff Desk')
    expect(handoffCard).not.toContain('Business case')
    expect(handoffCard).not.toContain('Live')
  })
})
