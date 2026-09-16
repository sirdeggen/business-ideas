import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AMOUNT_IN_ADVANCED,
  ATTEST_BUTTON,
  BUSINESS_CASE_CITATIONS,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
  EMPTY,
  EYEBROW,
  FOOTER,
  LEDE,
  LOOKUP_BUTTON,
  PRIMARY_COPY,
  SLASH_BUTTON,
  TITLE,
  VOUCH_BUTTON,
  VOUCH_JOB,
  notFoundLine,
  sheetTitle
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const html = readFileSync(join(here, '../../index.html'), 'utf8')
const css = readFileSync(join(here, '../index.css'), 'utf8')
const readme = readFileSync(join(here, '../../../README.md'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const styles = readFileSync(join(here, '../../../../pages/styles.css'), 'utf8')
const pagesYml = readFileSync(join(here, '../../../../.github/workflows/pages.yml'), 'utf8')
const rootReadme = readFileSync(join(here, '../../../../README.md'), 'utf8')
const cardStart = catalog.indexOf('href="./vouch/"')
const vouchCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const liveStart = catalog.indexOf('aria-label="Live"')
const liveSection = catalog.slice(liveStart, catalog.indexOf('aria-label="Server"'))
const face = app.slice(0, app.indexOf('<details'))
const lookupFn = app.slice(app.indexOf('const runLookup'), app.indexOf('const openRow'))
const vouchFn = app.slice(app.indexOf('const runVouch'), app.indexOf('const runAttest'))
const attestFn = app.slice(app.indexOf('const runAttest'), app.indexOf('const runSlash'))
const slashFn = app.slice(app.indexOf('const runSlash'), app.indexOf('const runRelease'))

describe('first-paint copy', () => {
  it('names the job, not a protocol sentence', () => {
    expect(html).toContain('<title>Vouch Desk</title>')
    expect(TITLE).toBe('Vouch Desk')
    expect(EYEBROW).toBe('Vouch')
    expect(LEDE).toBe('Stake a slashable vouch. Attest. Slash on bad faith.')
    expect(LOOKUP_BUTTON).toBe('Look up')
    expect(VOUCH_BUTTON).toBe('Vouch')
    expect(ATTEST_BUTTON).toBe('Attest')
    expect(SLASH_BUTTON).toBe('Slash')
    expect(sheetTitle(null)).toBe('Vouch Desk')
    expect(sheetTitle('North Mill')).toBe('North Mill')
    expect(notFoundLine('north')).toBe('No vouch for north.')
    expect(FOOTER).toBe('Not a name lease. Not a title. Not a membership. Not a provenance receipt. Not a trading market.')
    expect(app).toContain('{EYEBROW}')
    expect(app).toContain('{LEDE}')
    expect(app).toContain('LOOKUP_BUTTON')
    expect(app).toContain('VOUCH_BUTTON')
    expect(app).toContain('ATTEST_BUTTON')
    expect(app).toContain('SLASH_BUTTON')
    expect(app).toContain('{FOOTER}')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('namelease')
    expect(app).not.toContain('reputation market')
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Connecting…')
    expect(app).not.toContain('Connect')
    expect(face).not.toContain('Live')
    expect(vouchCard).toContain('class="badge">Server<')
    expect(vouchCard).toContain('>View<')
    expect(vouchCard).toContain('How to run')
    expect(vouchCard).toContain(LEDE)
    expect(vouchCard).not.toContain('Live')
    expect(vouchCard).not.toContain('Open UI')
    expect(vouchCard).not.toContain('sats')
    expect(liveSection).toContain('href="./streampay/"')
    expect(liveSection).toContain('href="./grants/"')
    expect(liveSection).not.toContain('href="./vouch/"')
    expect(liveSection).not.toContain('href="./kya/"')
    expect(rootReadme).toContain('## KYA')
    expect(rootReadme).toContain('./kya/README.md')
    expect(pagesYml).toContain('vouch/frontend/package-lock.json')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/vouch/')
    expect(pagesYml).toContain('site/vouch')
    expect(rootReadme).toContain('## Vouch Desk')
    expect(rootReadme).toContain('./vouch/README.md')
  })

  it('keeps identity hex and sats off the face', () => {
    expect(face).not.toContain('identity key')
    expect(face).not.toContain('{identityKey}')
    expect(face).not.toContain('sats')
    expect(app).toContain('<summary>Advanced</summary>')
    expect(app).toContain('formatSats(FEE_SATS)')
    expect(app).toContain('shortKey(selected.txid')
  })

  it('asks the wallet only on Vouch / Attest / Slash, after the form is ready', () => {
    expect(lookupFn).not.toContain('ensureWallet')
    expect(lookupFn).not.toContain('connect()')
    expect(vouchFn.indexOf('assertCanVouch')).toBeLessThan(vouchFn.indexOf('ensureWallet'))
    expect(attestFn.indexOf('assertCanAttest')).toBeLessThan(attestFn.indexOf('ensureWallet'))
    expect(slashFn.indexOf('ensureWallet')).toBeGreaterThan(-1)
    expect(app).toContain('const session = await ensureWallet()')
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).toContain('isWalletMissing')
  })

  it('hints Amount in Advanced when dollars are not on the face', () => {
    expect(AMOUNT_IN_ADVANCED).toBe('Amount in Advanced')
    expect(app).toContain('AMOUNT_IN_ADVANCED')
    expect(app).toContain('priceFace(FEE_SATS, rate)')
    expect(face).not.toContain('$—')
  })

  it('paints rose-and-wine, not paper-and-navy invoices', () => {
    expect(css).toContain('--paper: #F3E8E4')
    expect(css).toContain('--ink: #1A1216')
    expect(css).toContain('--rose:')
    expect(css).toContain('--wine:')
    expect(css).not.toContain('--paper: #F7F5F2')
    expect(css).not.toContain('--ink: #1F3A5F')
  })

  it('shows look up and the list before wallet chrome', () => {
    const lookup = app.indexOf('Look up')
    const list = app.indexOf('{LIST_HEADING}')
    const vouch = app.indexOf('{VOUCH_HEADING}')
    const install = app.indexOf('{showInstall &&')
    expect(lookup).toBeGreaterThan(-1)
    expect(list).toBeGreaterThan(lookup)
    expect(vouch).toBeGreaterThan(list)
    expect(install).toBeGreaterThan(vouch)
  })

  it('adds vouch to Pages without dropping existing slugs or adding a deploy job', () => {
    expect(pagesYml).toContain('vouch/frontend/package-lock.json')
    expect(pagesYml).toContain('working-directory: vouch/frontend')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/vouch/')
    expect(pagesYml).toContain('VITE_OVERLAY_URL: https://overlay-us-1.bsvb.tech')
    expect(pagesYml).toContain('site/vouch')
    expect(pagesYml).toContain('cp -r vouch/frontend/dist/. site/vouch/')
    expect(pagesYml).toContain('site/tickets')
    expect(pagesYml).toContain('site/titles')
    expect(pagesYml).toContain('site/trace')
    expect(pagesYml).toContain('site/job-escrow')
    expect(pagesYml).toContain('site/vault-claim')
    expect(pagesYml).toContain('site/kya')
    expect(pagesYml).toContain('site/records')
    expect(pagesYml).toContain('site/datasets')
    expect(pagesYml).toContain('site/raffle')
    expect(pagesYml).toContain('site/memberships')
    expect(pagesYml).toContain('site/names')
    expect(pagesYml).toContain('titles/frontend/package-lock.json')
    expect(pagesYml).toContain('trace/frontend/package-lock.json')
    expect(pagesYml).toContain('job-escrow/frontend/package-lock.json')
    expect(pagesYml).toContain('vault-claim/frontend/package-lock.json')
    expect(pagesYml).toContain('kya/frontend/package-lock.json')
    expect(pagesYml).toContain('working-directory: titles/frontend')
    expect(pagesYml).toContain('working-directory: trace/frontend')
    expect(pagesYml).toContain('working-directory: job-escrow/frontend')
    expect(pagesYml).toContain('working-directory: vault-claim/frontend')
    expect(pagesYml).toContain('working-directory: kya/frontend')
    expect(pagesYml).toContain('cp -r titles/frontend/dist/. site/titles/')
    expect(pagesYml).toContain('cp -r trace/frontend/dist/. site/trace/')
    expect(pagesYml).toContain('cp -r job-escrow/frontend/dist/. site/job-escrow/')
    expect(pagesYml).toContain('cp -r vault-claim/frontend/dist/. site/vault-claim/')
    expect(pagesYml).toContain('cp -r kya/frontend/dist/. site/kya/')
    expect(pagesYml.match(/^  deploy:/gm)).toHaveLength(1)
  })

  it('keeps sibling catalog cards and stays off name / title / membership / trace copy', () => {
    expect(catalog).toContain('href="./tickets/"')
    expect(catalog).toContain('href="./titles/"')
    expect(catalog).toContain('href="./trace/"')
    expect(catalog).toContain('href="./job-escrow/"')
    expect(catalog).toContain('href="./vault-claim/"')
    expect(catalog).toContain('href="./kya/"')
    expect(catalog).toContain('href="./vouch/"')
    expect(catalog).toContain('href="./names/"')
    expect(catalog).toContain('href="./memberships/"')
    expect(catalog).toContain('src="./scenes/kya.webp"')
    expect(catalog).toContain('src="./scenes/vouch.webp"')
    expect(styles).toContain('.demo-vouch')
    expect(readme).toContain('?v=')
    expect(readme).toContain('query params')
    expect(VOUCH_JOB).toBe('A label, the supplier, and a bond.')
    expect(EMPTY).toBe('Look up a vouch.')
    expect(vouchCard).not.toContain('name lease')
    expect(vouchCard).not.toContain('titled document')
    expect(vouchCard).not.toContain('timed key')
    expect(vouchCard).not.toContain('provenance')
    expect(vouchCard).not.toContain('trading market')
    expect(vouchCard).not.toContain('Business case')
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/\bLive\b/)
      expect(line).not.toMatch(/\bsats?\b/i)
      if (line !== FOOTER) {
        expect(line).not.toContain('name lease')
        expect(line).not.toContain('trading market')
      }
    }
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

  it('keeps the locked Revandrew PASS bodies and does not dump Margaret, Status, or Sources', () => {
    expect(BUSINESS_CASE_WHY).toBe(
      'Informal vendor trust breaks when someone vouches with words only. A slashable vouch puts skin in the game: stake, attest, and slash on bad faith — credibility with a bond, not a tradable reputation token.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Buyers and peers who already vouch for vendors (enterprise: procurement / vendor risk; grassroots: co-ops and community orgs). Vouchers lock stake; bad faith can cost them.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'Ethos Network (DefiLlama, fetched Sep 2026): ~$931K TVL in the Vouch contract on Base — ETH locked as trust relationships. Protocol fee / vouch revenue is unknown on DefiLlama’s fees board. This desk is slashable vouch/attestation only — not a reputation-trading market.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain analog: Ethos-style slashable vouch — participants lock value behind another party and can propose slash on bad faith.'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: Surety bonds, trade credit insurance, vendor scorecards, escrow holdbacks — people already pay for “someone stands behind this supplier.”'
    )
    expect(BUSINESS_CASE_DEMO).toBe(
      'Stake a vouch, attest, and show what slash looks like on a public desk URL.'
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
    expect(joined).not.toMatch(/Revandrew/)
    expect(joined).not.toMatch(/Ethos Markets/)
    expect(joined).toContain('not a tradable reputation token')
    expect(joined).toContain('not a reputation-trading market')
  })

  it('offers at most three citation chips and skips Ethos Markets', () => {
    expect(BUSINESS_CASE_CITATIONS.length).toBeLessThanOrEqual(3)
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual([
      'DefiLlama Sep 2026',
      'Ethos docs'
    ])
    for (const cite of BUSINESS_CASE_CITATIONS) {
      expect(cite.label).not.toMatch(/Ethos Markets/)
      expect(cite.href).not.toMatch(/markets/i)
    }
  })

  it('sits once below the head and above the desk, catalog stays Server', () => {
    expect(app).toContain('<BusinessCase />')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const desk = app.indexOf('className="slip"')
    const install = app.indexOf('{showInstall &&')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(desk).toBeGreaterThan(caseMark)
    expect(install).toBeGreaterThan(desk)

    expect(css).toContain('.business-case')
    expect(css).toContain('border-left: 3px solid var(--rose)')
    expect(css).toContain('color: var(--wine)')

    expect(vouchCard).toContain('class="badge">Server<')
    expect(vouchCard).toContain('>View<')
    expect(vouchCard).not.toContain('Live')
    expect(vouchCard).not.toContain('Business case')
    expect(liveSection).not.toContain('href="./vouch/"')
  })
})
