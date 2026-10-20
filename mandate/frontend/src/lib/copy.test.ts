import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BUSINESS_CASE_BUYER,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_PROOF,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TAM,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHY,
  DESK_NOTE,
  EYEBROW,
  FOOTER,
  LEDE,
  LOCAL_NOTE,
  OPEN_BUTTON,
  OPEN_JOB,
  PRIMARY_COPY,
  PRODUCT,
  RECEIPT_NOTE,
  RECORD_BUTTON,
  RECORD_JOB,
  SCENE_ALT,
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
const cardStart = catalog.indexOf('id="mandate-desk"')
const mandateCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const streamStart = catalog.indexOf('href="./streampay/"')
const streamCard = catalog.slice(streamStart, catalog.indexOf('</article>', streamStart))
const grantStart = catalog.indexOf('href="./grants/"')
const grantCard = catalog.slice(grantStart, catalog.indexOf('</article>', grantStart))
const face = app.slice(0, app.indexOf('<details'))
const advanced = app.slice(app.indexOf('<details'))

function between(source: string, start: string, end: string): string {
  return source.slice(source.indexOf(start), source.indexOf(end))
}

describe('first-paint copy', () => {
  it('names the desk and the job without a wallet gate', () => {
    expect(html).toContain('<title>Mandate Desk</title>')
    expect(TITLE).toBe('Mandate Desk')
    expect(PRODUCT).toBe('Mandate Desk')
    expect(LEDE).toBe('Hire a manager without handing over the keys. A whitelist, a period cap, and a fee by formula. The owner can always pull the balance back.')
    expect(OPEN_BUTTON).toBe('Open the mandate')
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

  it('keeps one title and a quieter Mandate eyebrow', () => {
    expect(EYEBROW).toBe('Mandate')
    expect(app).toContain('className="eyebrow">{EYEBROW}<')
    expect(app).toContain('<h1>{TITLE}</h1>')
  })

  it('asks the wallet only when recording', () => {
    expect(between(app, 'const runOpen', 'const runFund')).not.toContain('ensureWallet')
    expect(between(app, 'const runFund', 'const runGain')).not.toContain('ensureWallet')
    expect(between(app, 'const runGain', 'const runSend')).not.toContain('ensureWallet')
    expect(between(app, 'const runSend', 'const runRecall')).not.toContain('ensureWallet')
    expect(between(app, 'const runRecall', 'const runChange')).not.toContain('ensureWallet')
    expect(between(app, 'const runChange', 'const runRecord')).not.toContain('ensureWallet')
    expect(between(app, 'const runRecord', 'const startOver')).toContain('const session = await ensureWallet()')
    expect(app.split('const session = await ensureWallet()')).toHaveLength(2)
    expect(app).toContain('isWalletMissing')
    expect(face.indexOf('{RECORD_JOB}')).toBeGreaterThan(face.indexOf('{OPEN_JOB}'))
    expect(face.indexOf('{showInstall &&')).toBeGreaterThan(face.indexOf('{RECORD_JOB}'))
  })

  it('is an owner lock with a hired manager, distinct from treasury, spend policy, and credit', () => {
    expect(FOOTER).toMatch(/board vault/)
    expect(FOOTER).toMatch(/spend policy/)
    expect(FOOTER).toMatch(/credit facility/)
    expect(readme).toMatch(/not Treasury/i)
    expect(readme).toMatch(/not Spend Policy/i)
    expect(readme).toMatch(/not Credit/i)
    expect(readme).toMatch(/OP_CHECKSIG/)
    expect(readme).toMatch(/OP_PUSH_TX/)
    expect(readme).toMatch(/createSignature/)
    expect(readme).toMatch(/anyone/)
    expect(readme).toMatch(/sha256\(ownerKey \|\| nonce\)/)
  })

  it('keeps the catalog card Server + View at the top of the Server ledger', () => {
    expect(mandateCard).toContain('class="badge">Server<')
    expect(mandateCard).toContain('>View<')
    expect(mandateCard).not.toContain('Live')
    expect(mandateCard).not.toContain('Open UI')
    expect(mandateCard).toContain('Mandate Desk')
    expect(mandateCard).toContain(LEDE)
    expect(mandateCard).toContain('mandate/README.md')
    expect(mandateCard).toContain('scenes/mandate.webp')
    expect(mandateCard).toContain(SCENE_ALT)
    expect(mandateCard).toContain('How to run')
    const ledger = catalog.slice(catalog.indexOf('aria-label="Server"'), catalog.indexOf('aria-label="Live"'))
    const spotlight = catalog.slice(catalog.indexOf('aria-label="Live"'))
    expect(ledger.indexOf('id="mandate-desk"')).toBeGreaterThan(-1)
    expect(ledger.indexOf('id="mandate-desk"')).toBeLessThan(ledger.indexOf('id="bounty-desk"'))
    expect(ledger.indexOf('id="bounty-desk"')).toBeLessThan(ledger.indexOf('id="keepsake-desk"'))
    expect(spotlight).not.toContain('id="mandate-desk"')
    expect(catalog.match(/id="mandate-desk"/g)).toHaveLength(1)
    expect(readme).toContain('# Mandate Desk (v0)')
    expect(readme).toContain('tm_anytx')
    expect(readme).toContain('ls_anytx')
    expect(readme).toContain('overlay-us-1')
    expect(rootReadme).toContain('## Mandate Desk\n')
    expect(html).toContain('<title>Mandate Desk</title>')
    expect(readme).toContain('?m=<mandateId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/m\/:id/)
    expect(app).toContain(`alt={SCENE_ALT}`)
  })

  it('leaves StreamPay and Grant receipt Live and keeps every catalog neighbor', () => {
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(streamCard).toContain('Pay as they work.')
    expect(grantCard).toContain('A gift for a purpose.')
    expect(catalog.match(/class="badge">Live</g)).toHaveLength(2)
    for (const slug of [
      'bounty', 'keepsake', 'check', 'scrip', 'boost', 'private-pay', 'closing', 'cover', 'inference', 'feed', 'registry', 'credit', 'handoff', 'vouch', 'kya',
      'vault-claim', 'job-escrow', 'trace', 'titles', 'names', 'memberships', 'datasets',
      'session', 'spend-policy', 'raffle', 'treasury', 'tickets', 'records',
      'receivables', 'grants', 'streampay', 'invoices'
    ]) {
      expect(catalog).toContain(`href="./${slug}/"`)
    }
  })

  it('uses a teal chip and adds the mandate desk to Pages without dropping the others', () => {
    expect(css).toContain('--seal: #0f766e')
    expect(css).toContain('Fraunces')
    expect(catalogCss).toContain('.demo-mandate')
    expect(catalogCss).toMatch(/\.demo-mandate \{[^}]*--chip: #0f766e;/)
    expect(catalogCss).toMatch(/\.demo-mandate \{[^}]*--title: #134e4a;/)
    expect(catalogCss.match(/#0f766e/g)).toHaveLength(1)
    expect(catalogCss).toContain('.demo-bounty')
    expect(catalogCss).toContain('.demo-keepsake')
    expect(catalogCss).toContain('.demo-scrip')
    expect(catalogCss).toContain('--chip: #a21caf')
    expect(pagesYml).toContain('# mandate-desk')
    expect(pagesYml).toContain('# bounty-desk')
    expect(pagesYml).toContain('# keepsake-desk')
    expect(pagesYml).toContain('# scrip-desk')
    expect(pagesYml.match(/# mandate-desk/g)).toHaveLength(3)
    expect(pagesYml).toContain('mandate/frontend/package-lock.json')
    expect(pagesYml).toContain('site/mandate')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/mandate/')
    expect(pagesYml.match(/^  deploy:/gm)).toHaveLength(1)
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'feed', 'inference', 'cover', 'scenes', 'closing',
      'private-pay', 'boost', 'scrip', 'check', 'keepsake', 'bounty', 'mandate'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
  })

  it('puts the business case under the head and above the form, and keeps it after a mandate is open', () => {
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const form = app.indexOf('{OPEN_JOB}')
    expect(caseMark).toBeGreaterThan(head)
    expect(form).toBeGreaterThan(caseMark)
    expect(app.slice(0, caseMark)).not.toContain('{!mandate &&')
    expect(app.slice(0, caseMark)).not.toContain('{mandate &&')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    expect(businessCase).toContain('<details')
    expect(businessCase).toContain('open={expanded}')
    expect(businessCase).toContain('<summary id="business-case-heading">{BUSINESS_CASE_TITLE}</summary>')
    expect(app.indexOf('{RECEIPT_NOTE}')).toBeGreaterThan(caseMark)
    expect(app.indexOf('{RECEIPT_NOTE}')).toBeLessThan(form)
    expect(businessCase).not.toContain(RECEIPT_NOTE)
    expect(mandateCard).not.toContain('Business case')
    expect(app).toContain('id="public-book"')
    expect(app).toContain('id="fee-line"')
    expect(app).toContain('id="cap-line"')
    expect(app).toContain('id="owner-lock"')
    expect(app).toContain('id="notice-line"')
  })

  it('says what the script enforces and what is only computed and recorded', () => {
    expect(RECEIPT_NOTE).toMatch(/script enforces/)
    expect(RECEIPT_NOTE).toMatch(/OP_CHECKSIG/)
    expect(RECEIPT_NOTE).toMatch(/computes and records/)
    expect(RECEIPT_NOTE).toMatch(/OP_PUSH_TX/)
    expect(RECEIPT_NOTE).toMatch(/does not pay the fee out/)
    expect(DESK_NOTE).toMatch(/before the wallet opens/)
    expect(DESK_NOTE).toMatch(/not in the script/)
    expect(LOCAL_NOTE).toMatch(/desk rules/)
    expect(LOCAL_NOTE).toMatch(/does not move the balance/)
    expect(face).toContain('{RECEIPT_NOTE}')
    expect(face).toContain('{DESK_NOTE}')
    expect(advanced).toContain('{LOCAL_NOTE}')
    expect(readme).toContain('computes and records')
    expect(readme).toContain('OP_PUSH_TX')
    expect(rootReadme).toContain(LEDE)
    expect(BUSINESS_CASE_DEMO).toMatch(/notice period/)
    expect(BUSINESS_CASE_WHY).not.toMatch(/\bBSV\b/)
    expect(LEDE).not.toMatch(/\bBSV\b/)
    expect(RECORD_JOB).toBe('The walkthrough is done here. A wallet only writes the public record.')
  })
})

describe('Business case page copy is locked', () => {
  it('uses TAM, buyer, analog proof, and demo goal', () => {
    expect(BUSINESS_CASE_TITLE).toBe('Business case')
    expect([...BUSINESS_CASE_FIELDS]).toEqual([
      'Why it exists',
      'TAM',
      'Buyer',
      'Analog proof',
      'Demo goal'
    ])
    const why = businessCase.indexOf('<dt>Why it exists</dt>')
    const tam = businessCase.indexOf('<dt>TAM</dt>')
    const buyer = businessCase.indexOf('<dt>Buyer</dt>')
    const proof = businessCase.indexOf('<dt>Analog proof</dt>')
    const demo = businessCase.indexOf('<dt>Demo goal</dt>')
    expect(tam).toBeGreaterThan(why)
    expect(buyer).toBeGreaterThan(tam)
    expect(proof).toBeGreaterThan(buyer)
    expect(demo).toBeGreaterThan(proof)
    expect(businessCase).toContain('{BUSINESS_CASE_TAM}')
    expect(businessCase).toContain('{BUSINESS_CASE_BUYER}')
    expect(BUSINESS_CASE_TAM).toMatch(/\$742,612/)
    expect(BUSINESS_CASE_TAM).toMatch(/\$448,341/)
    expect(BUSINESS_CASE_TAM).toMatch(/DefiLlama/)
    expect(BUSINESS_CASE_BUYER).toMatch(/endowment/)
    expect(BUSINESS_CASE_BUYER).toMatch(/does not hand over its keys/)
    expect(BUSINESS_CASE_PROOF_CHAIN).toMatch(/Sentora Curator/)
    expect(BUSINESS_CASE_PROOF_CHAIN).toMatch(/Steakhouse Financial/)
    expect(BUSINESS_CASE_PROOF_FIAT).toMatch(/HOA/)
    expect(`${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`).toBe(BUSINESS_CASE_PROOF)
    expect(BUSINESS_CASE_DEMO).toMatch(/whitelist/)
    expect(BUSINESS_CASE_DEMO).toMatch(/performance fee/)
    expect(BUSINESS_CASE_WHY).toMatch(/outside manager/)
  })
})
