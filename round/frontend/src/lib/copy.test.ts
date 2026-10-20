import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BUSINESS_CASE_CITATIONS,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
  DESK_NOTE,
  EYEBROW,
  FOOTER,
  LEDE,
  OPEN_BUTTON,
  OPEN_JOB,
  PRIMARY_COPY,
  PRODUCT,
  RECORD_BUTTON,
  RECORD_JOB,
  SCENE_ALT,
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
const cardStart = catalog.indexOf('id="round-desk"')
const roundCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
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
    expect(html).toContain('<title>Round Desk</title>')
    expect(TITLE).toBe('Round Desk')
    expect(PRODUCT).toBe('Round Desk')
    expect(LEDE).toMatch(/minimum/)
    expect(LEDE).toMatch(/issuer/)
    expect(LEDE).toMatch(/computed/)
    expect(OPEN_BUTTON).toBe('Open the raise')
    expect(RECORD_BUTTON).toBe('Record on the public book')
    expect(app).toContain('{LEDE}')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('Connect')
    expect(app).not.toContain('Open UI')
    expect(app).not.toContain('>Live<')
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/Install Desktop/)
      expect(line).not.toMatch(/\bLive\b/)
    }
    expect(face.indexOf('Install BSV Desktop')).toBeGreaterThan(face.indexOf('{showInstall &&'))
    expect(face).toContain('const showInstall = walletMissing || actionNeedsInstall')
  })

  it('keeps one title and a quieter Round eyebrow', () => {
    expect(EYEBROW).toBe('Round')
    expect(app).toContain('className="eyebrow">{EYEBROW}<')
    expect(app).toContain('<h1>{TITLE}</h1>')
  })

  it('asks the wallet only when recording', () => {
    expect(between(app, 'const runOpen', 'const runDisclose')).not.toContain('ensureWallet')
    expect(between(app, 'const runDisclose', 'const runCommit')).not.toContain('ensureWallet')
    expect(between(app, 'const runCommit', 'const runClose')).not.toContain('ensureWallet')
    expect(between(app, 'const runClose', 'const runRecord')).not.toContain('ensureWallet')
    expect(between(app, 'const runRecord', 'const startOver')).toContain('const session = await ensureWallet()')
    expect(app.split('const session = await ensureWallet()')).toHaveLength(2)
    expect(app).toContain('isWalletMissing')
    expect(face.indexOf('{RECORD_JOB}')).toBeGreaterThan(face.indexOf('{OPEN_JOB}'))
    expect(face.indexOf('{showInstall &&')).toBeGreaterThan(face.indexOf('{RECORD_JOB}'))
  })

  it('is a compliance-first raise, with the script and the computed record named apart', () => {
    expect(FOOTER).toMatch(/No token market/)
    expect(FOOTER).toMatch(/no secondary trading/)
    expect(SCRIPT_NOTE).toMatch(/issuer custody/)
    expect(SCRIPT_NOTE).toMatch(/does not read the minimum/)
    expect(SCRIPT_NOTE).toMatch(/no on-chain refund/)
    expect(DESK_NOTE).toMatch(/overlay host/)
    expect(DESK_NOTE).toMatch(/pending/)
    expect(DESK_NOTE).toMatch(/nLockTime/)
    expect(DESK_NOTE).toMatch(/issuer/)
    expect(readme).toMatch(/createAction/)
    expect(readme).toMatch(/does not treat any other script/)
    expect(DESK_NOTE).toMatch(/OP_PUSH_TX/)
    expect(DESK_NOTE).toMatch(/v1 work/)
    expect(DESK_NOTE).toMatch(/secondary market/)
    expect(app).toContain('{SCRIPT_NOTE}')
    expect(app).toContain('{DESK_NOTE}')
    expect(readme).toMatch(/not Registry Desk/i)
    expect(readme).toMatch(/not Keepsake/i)
    expect(readme).toMatch(/not Bounty/i)
    expect(readme).toMatch(/OP_PUSH_TX/)
    expect(readme).toMatch(/sha256\(issuerKey/)
    expect(readme).toMatch(/createSignature/)
    expect(readme).toMatch(/anyone/)
    expect(readme).toMatch(/BRC-52\/53/)
    expect(readme).toMatch(/no secondary trading/i)
  })

  it('keeps the catalog card Server + View at the top of the Server ledger', () => {
    expect(roundCard).toContain('class="badge">Server<')
    expect(roundCard).toContain('>View<')
    expect(roundCard).not.toContain('Live')
    expect(roundCard).not.toContain('Open UI')
    expect(roundCard).toContain('Round Desk')
    expect(roundCard).toContain(LEDE)
    expect(roundCard).toContain('round/README.md')
    expect(roundCard).toContain('scenes/round.webp')
    expect(roundCard).toContain('How to run')
    expect(roundCard).toContain(SCENE_ALT)
    expect(app).toContain(`alt={SCENE_ALT}`)
    const ledger = catalog.slice(catalog.indexOf('aria-label="Server"'), catalog.indexOf('aria-label="Live"'))
    const spotlight = catalog.slice(catalog.indexOf('aria-label="Live"'))
    expect(ledger.indexOf('id="round-desk"')).toBeGreaterThan(-1)
    expect(ledger.indexOf('id="round-desk"')).toBeLessThan(ledger.indexOf('id="bounty-desk"'))
    expect(ledger.indexOf('id="bounty-desk"')).toBeLessThan(ledger.indexOf('id="check-desk"'))
    expect(spotlight).not.toContain('id="round-desk"')
    expect(readme).toContain('# Round Desk (v0)')
    expect(readme).toContain('tm_anytx')
    expect(readme).toContain('ls_anytx')
    expect(readme).toContain('overlay-us-1')
    expect(rootReadme).toContain('## Round Desk\n')
    expect(rootReadme).toContain(LEDE)
    expect(html).toContain('<title>Round Desk</title>')
    expect(readme).toContain('?r=<roundId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/r\/:id/)
    expect(catalog.match(/id="round-desk"/g)).toHaveLength(1)
  })

  it('leaves StreamPay and Grant receipt Live and keeps every catalog neighbor', () => {
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    for (const slug of [
      'bounty', 'keepsake', 'check', 'scrip', 'boost', 'private-pay', 'closing', 'cover', 'inference', 'feed', 'registry', 'credit', 'handoff', 'vouch', 'kya',
      'vault-claim', 'job-escrow', 'trace', 'titles', 'names', 'memberships', 'datasets',
      'session', 'spend-policy', 'raffle', 'treasury', 'tickets', 'records',
      'receivables', 'grants', 'streampay', 'invoices'
    ]) {
      expect(catalog).toContain(`href="./${slug}/"`)
    }
  })

  it('uses its own chip and adds the round desk to Pages without dropping the others', () => {
    expect(css).toContain('--seal: #d946ef')
    expect(catalogCss).toContain('.demo-round')
    expect(catalogCss).toMatch(/\.demo-round \{[^}]*--chip: #d946ef;/)
    expect(catalogCss).toMatch(/\.demo-round \{[^}]*--title: #701a75;/)
    expect(catalogCss.match(/--chip: #d946ef/g)).toHaveLength(1)
    expect(catalogCss).toContain('--chip: #FF7A3D')
    expect(catalogCss).toContain('--chip: #a21caf')
    expect(catalogCss).toContain('--chip: #FFC800')
    expect(pagesYml).toContain('# round-desk')
    expect(pagesYml).toContain('# bounty-desk')
    expect(pagesYml).toContain('# keepsake-desk')
    expect(pagesYml).toContain('round/frontend/package-lock.json')
    expect(pagesYml).toContain('site/round')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/round/')
    expect(pagesYml.match(/^  deploy:/gm)).toHaveLength(1)
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'feed', 'inference', 'cover', 'scenes', 'closing',
      'private-pay', 'boost', 'scrip', 'check', 'keepsake', 'bounty', 'round'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
  })

  it('puts the business case under the head and above the form', () => {
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const form = app.indexOf('{OPEN_JOB}')
    expect(caseMark).toBeGreaterThan(head)
    expect(form).toBeGreaterThan(caseMark)
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    expect(businessCase).toContain('<details')
    expect(businessCase).toContain('open={expanded}')
    expect(businessCase).toContain('<summary id="business-case-heading">{BUSINESS_CASE_TITLE}</summary>')
    expect(app.indexOf('{SCRIPT_NOTE}')).toBeGreaterThan(caseMark)
    expect(app.indexOf('{SCRIPT_NOTE}')).toBeLessThan(form)
    expect(roundCard).not.toContain('Business case')
    expect(app).toContain('id="eligibility"')
    expect(app).toContain('id="escrow"')
    expect(app).toContain('id="close-result"')
    expect(app).toContain('id="handoff"')
    expect(app).toContain('id="public-book"')
    expect(BUSINESS_CASE_WHY).not.toMatch(/\bBSV\b/)
    expect(LEDE).not.toMatch(/\bBSV\b/)
    expect(BUSINESS_CASE_MARKET).toBe('Echo raised $200M+ across ~300 deals by Oct 2025, and Coinbase bought it for ~$375M (Reuters, 21 Oct 2025). DefiLlama shows ~$325k fee revenue over the past year, and it arrives in lumps. Share of community raises this desk can take is unknown.')
    expect(BUSINESS_CASE_MARKET).not.toMatch(/TAM signal/)
    expect(BUSINESS_CASE_WHO).toBe('The business running the raise pays a percentage of a successful raise; backers pay a small fee per eligibility check. v0 shows the fee but does not charge it.')
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe('Other-chain analog: Ethos\'s token sale on Sonar drew $8.4M in bids (Gate News, 7 Sep 2026).')
    expect(BUSINESS_CASE_PROOF_CHAIN.startsWith('Other-chain analog:')).toBe(true)
    expect(BUSINESS_CASE_PROOF_CHAIN).not.toMatch(/token market/)
    expect(BUSINESS_CASE_PROOF_FIAT).toBe('Regulated crowdfunding portals and co-op member-share offerings, where issuers already pay a percentage of the money raised.')
    expect(BUSINESS_CASE_PROOF_FIAT).not.toMatch(/\$/)
    const prose = [BUSINESS_CASE_WHY, BUSINESS_CASE_WHO, BUSINESS_CASE_MARKET, BUSINESS_CASE_PROOF, BUSINESS_CASE_DEMO].join(' ')
    expect(prose).not.toMatch(/https?:\/\//)
    expect(prose.match(/\$200M\+/g)).toHaveLength(1)
    expect(prose.match(/~\$375M/g)).toHaveLength(1)
    expect(prose.match(/~\$325k/g)).toHaveLength(1)
    expect(prose.match(/\$8\.4M/g)).toHaveLength(1)
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual([
      'Coinbase, 21 Oct 2025',
      'Reuters, 21 Oct 2025',
      'DefiLlama Echo',
      'Gate News, 7 Sep 2026'
    ])
    expect(BUSINESS_CASE_CITATIONS.every((cite) => cite.href.startsWith('https://'))).toBe(true)
    expect(businessCase).toContain('className="cite-chip"')
    expect(businessCase).toContain('<h3>Sources</h3>')
    expect(BUSINESS_CASE_DEMO).toMatch(/no secondary trading/i)
    const how = app.slice(app.indexOf('<summary>How it works</summary>'), app.indexOf('<summary>Advanced</summary>'))
    expect(how).toContain('{LOCAL_NOTE}')
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
    expect(BUSINESS_CASE_DEMO.length).toBeGreaterThan(40)
    expect(OPEN_JOB.length).toBeGreaterThan(20)
    expect(RECORD_JOB.length).toBeGreaterThan(20)
  })
})
