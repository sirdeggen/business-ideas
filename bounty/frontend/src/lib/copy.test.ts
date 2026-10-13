import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
  DESK_NOTE,
  EXPORT_NOTE,
  EYEBROW,
  FOOTER,
  FUND_BUTTON,
  FUND_JOB,
  HASH_NOTE,
  LEDE,
  LOCAL_NOTE,
  PRIMARY_COPY,
  PRODUCT,
  RECORD_BUTTON,
  RECORD_JOB,
  SCRIPT_NOTE,
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
const cardStart = catalog.indexOf('id="bounty-desk"')
const bountyCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const streamStart = catalog.indexOf('href="./streampay/"')
const streamCard = catalog.slice(streamStart, catalog.indexOf('</article>', streamStart))
const grantStart = catalog.indexOf('href="./grants/"')
const grantCard = catalog.slice(grantStart, catalog.indexOf('</article>', grantStart))
const face = app.slice(0, app.indexOf('<details'))

function between(source: string, start: string, end: string): string {
  return source.slice(source.indexOf(start), source.indexOf(end))
}

describe('first-paint copy', () => {
  it('names the desk and the job without a wallet gate', () => {
    expect(html).toContain('<title>Bounty Desk</title>')
    expect(TITLE).toBe('Bounty Desk')
    expect(PRODUCT).toBe('Bounty Desk')
    expect(LEDE).toBe('Fund a severity-tiered bounty pool. Post a report hash. Release the matching tier.')
    expect(FUND_BUTTON).toBe('Fund the pool')
    expect(RECORD_BUTTON).toBe('Record on the public book')
    expect(app).toContain('{LEDE}')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('Connect')
    expect(app).not.toContain('Open UI')
    expect(app).not.toContain('Live')
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/Install Desktop/)
      expect(line).not.toMatch(/\bLive\b/)
    }
    expect(face.indexOf('Install BSV Desktop')).toBeGreaterThan(face.indexOf('{showInstall &&'))
    expect(face).toContain('const showInstall = walletMissing || actionNeedsInstall')
  })

  it('keeps one title and a quieter Bounty eyebrow', () => {
    expect(EYEBROW).toBe('Bounty')
    expect(app).toContain('className="eyebrow">{EYEBROW}<')
    expect(app).toContain('<h1>{TITLE}</h1>')
  })

  it('asks the wallet only when recording', () => {
    expect(between(app, 'const runFund', 'const runSubmit')).not.toContain('ensureWallet')
    expect(between(app, 'const runSubmit', 'const runVerdict')).not.toContain('ensureWallet')
    expect(between(app, 'const runVerdict', 'const runTimeline')).not.toContain('ensureWallet')
    expect(between(app, 'const runTimeline', 'const runExport')).not.toContain('ensureWallet')
    expect(between(app, 'const runExport', 'const runRecord')).not.toContain('ensureWallet')
    expect(between(app, 'const runRecord', 'const startOver')).toContain('const session = await ensureWallet()')
    expect(app.split('const session = await ensureWallet()')).toHaveLength(2)
    expect(app).toContain('isWalletMissing')
    expect(face.indexOf('{RECORD_JOB}')).toBeGreaterThan(face.indexOf('{FUND_JOB}'))
    expect(face.indexOf('{showInstall &&')).toBeGreaterThan(face.indexOf('{RECORD_JOB}'))
  })

  it('is a tiered bounty, distinct from a hired job, a gift, a claim, and a vouch', () => {
    expect(FOOTER).toBe('A tiered pool, a hash before the report, and a disclosure clock.')
    expect(FOOTER).not.toMatch(/Not a /)
    expect(readme).toMatch(/not Job Escrow/i)
    expect(readme).toMatch(/not Grants/i)
    expect(readme).toMatch(/not Cover/i)
    expect(readme).toMatch(/not Vouch/i)
    expect(HASH_NOTE).toMatch(/never goes on-chain/)
    expect(SCRIPT_NOTE).toMatch(/script enforces/)
    expect(DESK_NOTE).toMatch(/desk records/)
    expect(EXPORT_NOTE).toMatch(/not legal compliance advice/)
    expect(app).toContain('{HASH_NOTE}')
    expect(app).toContain('{SCRIPT_NOTE}')
    expect(app).toContain('{DESK_NOTE}')
    expect(app).toContain('{EXPORT_NOTE}')
  })

  it('keeps the catalog card Server + View at the top of the Server ledger', () => {
    expect(bountyCard).toContain('class="badge">Server<')
    expect(bountyCard).toContain('>View<')
    expect(bountyCard).not.toContain('Live')
    expect(bountyCard).not.toContain('Open UI')
    expect(bountyCard).toContain('Bounty Desk')
    expect(bountyCard).toContain(LEDE)
    expect(bountyCard).toContain('bounty/README.md')
    expect(bountyCard).toContain('scenes/bounty.webp')
    expect(bountyCard).toContain('How to run')
    const ledger = catalog.slice(catalog.indexOf('aria-label="Server"'), catalog.indexOf('aria-label="Live"'))
    const spotlight = catalog.slice(catalog.indexOf('aria-label="Live"'))
    expect(ledger.indexOf('id="bounty-desk"')).toBeGreaterThan(-1)
    expect(ledger.indexOf('id="bounty-desk"')).toBeLessThan(ledger.indexOf('id="check-desk"'))
    expect(ledger.indexOf('id="check-desk"')).toBeLessThan(ledger.indexOf('id="scrip-desk"'))
    expect(ledger.indexOf('id="scrip-desk"')).toBeLessThan(ledger.indexOf('id="boost-desk"'))
    const sceneAlt = 'A blonde researcher with a laptop showing a report hash, and a white male triager beside a board of four severity tiers, in a bright modern office.'
    expect(bountyCard).toContain(sceneAlt)
    expect(app).toContain(`alt="${sceneAlt}"`)
    expect(sceneAlt).toMatch(/four severity tiers/)
    expect(spotlight).not.toContain('id="bounty-desk"')
    expect(readme).toContain('# Bounty Desk (v0)')
    expect(readme).toContain('tm_anytx')
    expect(readme).toContain('ls_anytx')
    expect(rootReadme).toContain('## Bounty Desk\n')
    expect(html).toContain('<title>Bounty Desk</title>')
    expect(readme).toContain('?b=<bountyId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/b\/:id/)
    expect(catalog.match(/id="bounty-desk"/g)).toHaveLength(1)
  })

  it('leaves StreamPay and Grant receipt Live and keeps every catalog neighbor', () => {
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(streamCard).toContain('Pay as they work.')
    expect(grantCard).toContain('A gift for a purpose.')
    for (const slug of [
      'check', 'scrip', 'boost', 'private-pay', 'closing', 'cover', 'inference', 'feed', 'registry', 'credit', 'handoff', 'vouch', 'kya',
      'vault-claim', 'job-escrow', 'trace', 'titles', 'names', 'memberships', 'datasets',
      'session', 'spend-policy', 'raffle', 'treasury', 'tickets', 'records',
      'receivables', 'grants', 'streampay', 'invoices'
    ]) {
      expect(catalog).toContain(`href="./${slug}/"`)
    }
  })

  it('uses the orange chip and adds the bounty desk to Pages without dropping the others', () => {
    expect(css).toContain('--seal: #0369a1')
    expect(css).toContain('Source Serif 4')
    expect(catalogCss).toContain('.demo-bounty')
    expect(catalogCss).toContain('--chip: #FF7A3D')
    expect(catalogCss.match(/--chip: #FF7A3D/g)).toHaveLength(1)
    expect(pagesYml).toContain('# check-desk')
    expect(catalogCss).toContain('.demo-scrip')
    expect(catalogCss).toContain('.demo-job-escrow')
    expect(pagesYml).toContain('# bounty-desk')
    expect(pagesYml).toContain('# scrip-desk')
    expect(pagesYml).toContain('# boost-desk')
    expect(pagesYml).toContain('# private-pay-desk')
    expect(pagesYml).toContain('# closing-desk')
    expect(pagesYml).toContain('# cover-desk')
    expect(pagesYml).toContain('bounty/frontend/package-lock.json')
    expect(pagesYml).toContain('site/bounty')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/bounty/')
    expect(pagesYml.match(/^  deploy:/gm)).toHaveLength(1)
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'feed', 'inference', 'cover', 'scenes', 'closing',
      'private-pay', 'boost', 'scrip', 'check', 'bounty'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
  })

  it('puts the business case under the head and above the form', () => {
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const form = app.indexOf('{FUND_JOB}')
    expect(caseMark).toBeGreaterThan(head)
    expect(form).toBeGreaterThan(caseMark)
    expect(app.slice(0, caseMark)).not.toContain('{!fund &&')
    expect(app.slice(0, caseMark)).not.toContain('{fund &&')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    expect(businessCase).toContain('<details')
    expect(businessCase).toContain('open={expanded}')
    expect(businessCase).toContain('<summary id="business-case-heading">{BUSINESS_CASE_TITLE}</summary>')
    expect(app.indexOf('{HASH_NOTE}')).toBeGreaterThan(caseMark)
    expect(app.indexOf('{HASH_NOTE}')).toBeLessThan(form)
    expect(bountyCard).not.toContain('Business case')
    expect(app).toContain('id="report-hash"')
    expect(app).toContain('id="tier-release"')
    expect(app).toContain('id="timeline"')
    expect(app).toContain('id="export-record"')
    expect(app).toContain('id="public-book"')
  })

  it('says the body stays off-chain and the export is not legal advice', () => {
    expect(HASH_NOTE).toMatch(/Only its hash/)
    expect(LOCAL_NOTE).toMatch(/not in that transaction/)
    expect(LOCAL_NOTE).toMatch(/does not collect the submission fee/)
    expect(face).toContain('{EXPORT_NOTE}')
    expect(readme).toContain('never goes on-chain')
    expect(readme).toContain('not legal compliance advice')
    expect(rootReadme).toContain(LEDE)
    expect(BUSINESS_CASE_WHY).not.toMatch(/\bBSV\b/)
    expect(LEDE).not.toMatch(/\bBSV\b/)
    expect(BUSINESS_CASE_MARKET).toMatch(/\$66,945/)
    expect(BUSINESS_CASE_MARKET).toMatch(/\$382,689/)
    expect(BUSINESS_CASE_MARKET).toMatch(/11 Sep 2026/)
    expect(BUSINESS_CASE_MARKET).not.toMatch(/2,709/)
    expect(BUSINESS_CASE_PROOF).toMatch(/10%/)
    expect(BUSINESS_CASE_PROOF).not.toMatch(/5–8%/)
    expect(BUSINESS_CASE_PROOF).not.toMatch(/HackerOne/)
    expect(app).toContain('<summary>How it works</summary>')
    const how = app.slice(app.indexOf('<summary>How it works</summary>'), app.indexOf('<summary>Advanced</summary>'))
    expect(how).toContain('{LOCAL_NOTE}')
    expect(how).toContain('{FEE_HELPER}')
    expect(app.slice(0, app.indexOf('<summary>How it works</summary>'))).not.toContain('{FEE_HELPER}')
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
    const body = businessCase.slice(businessCase.indexOf('<dl>'))
    const positions = BUSINESS_CASE_FIELDS.map((field) => body.indexOf(field))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((left, right) => left - right)).toEqual(positions)
    expect(BUSINESS_CASE_WHY.length).toBeGreaterThan(40)
    expect(BUSINESS_CASE_WHO.length).toBeGreaterThan(40)
    expect(BUSINESS_CASE_PROOF.length).toBeGreaterThan(40)
    expect(BUSINESS_CASE_DEMO).toMatch(/export the disclosure timeline/)
    expect(FUND_JOB.length).toBeGreaterThan(20)
    expect(RECORD_JOB.length).toBeGreaterThan(20)
  })
})
