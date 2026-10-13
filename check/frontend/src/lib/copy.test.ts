import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BATCH_QUOTE,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
  BATCH_JOB,
  CHECK_BUTTON,
  CHECK_JOB,
  DEMO_NOTE,
  EYEBROW,
  FOOTER,
  LEDE,
  LOCAL_NOTE,
  PRIMARY_COPY,
  PRODUCT,
  RECEIPT_NOTE,
  RECORD_JOB,
  RECORD_RECEIPT_BUTTON,
  TITLE
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const businessCase = readFileSync(join(here, '../BusinessCase.tsx'), 'utf8')
const css = readFileSync(join(here, '../index.css'), 'utf8')
const copySource = readFileSync(join(here, 'copy.ts'), 'utf8')
const html = readFileSync(join(here, '../../index.html'), 'utf8')
const readme = readFileSync(join(here, '../../../README.md'), 'utf8')
const rootReadme = readFileSync(join(here, '../../../../README.md'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const catalogCss = readFileSync(join(here, '../../../../pages/styles.css'), 'utf8')
const pagesYml = readFileSync(join(here, '../../../../.github/workflows/pages.yml'), 'utf8')
const cardStart = catalog.indexOf('id="check-desk"')
const checkCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const streamStart = catalog.indexOf('href="./streampay/"')
const streamCard = catalog.slice(streamStart, catalog.indexOf('</article>', streamStart))
const grantStart = catalog.indexOf('href="./grants/"')
const grantCard = catalog.slice(grantStart, catalog.indexOf('</article>', grantStart))
const face = app.slice(0, app.indexOf('<details'))
const advanced = app.slice(app.indexOf('<details'))
const rendered = [copySource, app, businessCase, html, css].join('\n')

function between(source: string, start: string, end: string): string {
  return source.slice(source.indexOf(start), source.indexOf(end))
}

describe('first-paint copy', () => {
  it('names the desk and the job without a wallet gate', () => {
    expect(html).toContain('<title>Check Desk</title>')
    expect(TITLE).toBe('Check Desk')
    expect(PRODUCT).toBe('Check Desk')
    expect(LEDE).toMatch(/Enterprise AP/)
    expect(LEDE).toMatch(/subscribe/)
    expect(CHECK_BUTTON).toBe('Check this payee')
    expect(RECORD_RECEIPT_BUTTON).toBe('Record the receipt')
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
    expect(LEDE).not.toMatch(/stake/i)
    expect(CHECK_JOB).not.toMatch(/stake/i)
    expect(BATCH_JOB).not.toMatch(/stake/i)
    expect(face.indexOf('Install BSV Desktop')).toBeGreaterThan(face.indexOf('{showInstall &&'))
    expect(face).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(LEDE).not.toMatch(/\bBSV\b/)
    expect(TITLE).not.toMatch(/stake/i)
  })

  it('keeps one title and a quieter Check eyebrow', () => {
    expect(EYEBROW).toBe('Check')
    expect(app).toContain('className="eyebrow">{EYEBROW}<')
    expect(app).toContain('<h1>{TITLE}</h1>')
  })

  it('asks the wallet only when recording a flag, a receipt, or the fee', () => {
    expect(between(app, 'const runCheckPayee', 'const runBatchFile')).not.toContain('ensureWallet')
    expect(between(app, 'const runBatchFile', 'const runCancel')).not.toContain('ensureWallet')
    expect(between(app, 'const runCancel', 'const runFileFlag')).not.toContain('ensureWallet')
    expect(between(app, 'const runFileFlag', 'const runRecordReceipt')).not.toContain('ensureWallet')
    expect(between(app, 'const runRecordReceipt', 'const runRecordFlag')).toContain('const session = await ensureWallet()')
    expect(between(app, 'const runRecordFlag', 'const startOver')).toContain('const session = await ensureWallet()')
    expect(app.split('const session = await ensureWallet()')).toHaveLength(3)
    expect(app).toContain('isWalletMissing')
    expect(face.indexOf('{RECORD_JOB}')).toBeGreaterThan(face.indexOf('{CHECK_JOB}'))
    expect(face.indexOf('{showInstall &&')).toBeGreaterThan(face.indexOf('{RECORD_JOB}'))
  })

  it('is a shared payee check, distinct from closing, kya, vouch, cover, and spend policy', () => {
    expect(FOOTER).toMatch(/Not a payee bound inside one closing/)
    expect(FOOTER).toMatch(/Not who runs an agent/)
    expect(FOOTER).toMatch(/Not a general staked attestation/)
    expect(FOOTER).toMatch(/Not an insurance payout/)
    expect(readme).toMatch(/not Closing/i)
    expect(readme).toMatch(/not KYA/i)
    expect(readme).toMatch(/not Vouch/i)
    expect(readme).toMatch(/not Cover/i)
    expect(readme).toMatch(/not Spend Policy/i)
    expect(app).not.toContain('Deliverable hash')
  })

  it('keeps the catalog card Server + View at the top of the Server ledger', () => {
    expect(checkCard).toContain('class="badge">Server<')
    expect(checkCard).toContain('>View<')
    expect(checkCard).not.toContain('Live')
    expect(checkCard).not.toContain('Open UI')
    expect(checkCard).toContain('Check Desk')
    expect(checkCard).toContain(LEDE)
    expect(checkCard).toContain('check/README.md')
    expect(checkCard).toContain('scenes/check.webp')
    expect(checkCard).toContain('How to run')
    expect(catalog).toContain('<article class="card demo-check" id="check-desk">')
    const ledger = catalog.slice(catalog.indexOf('aria-label="Server"'), catalog.indexOf('aria-label="Live"'))
    expect(ledger.indexOf('id="check-desk"')).toBeLessThan(ledger.indexOf('id="scrip-desk"'))
    expect(ledger.indexOf('id="scrip-desk"')).toBeLessThan(ledger.indexOf('id="boost-desk"'))
    expect(ledger.indexOf('id="boost-desk"')).toBeLessThan(ledger.indexOf('id="private-pay-desk"'))
    expect(ledger.indexOf('id="private-pay-desk"')).toBeLessThan(ledger.indexOf('id="closing-desk"'))
    expect(ledger.indexOf('href="./check/"')).toBeLessThan(ledger.indexOf('href="./scrip/"'))
    expect(readme).toContain('# Check Desk (v0)')
    expect(readme).toContain('tm_anytx')
    expect(readme).toContain('ls_anytx')
    expect(rootReadme).toContain('## Check Desk\n')
    expect(html).toContain('<title>Check Desk</title>')
    expect(readme).toContain('?c=<checkId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/c\/:id/)
    expect(catalog.match(/id="check-desk"/g)).toHaveLength(1)
  })

  it('leaves StreamPay and Grant receipt Live and keeps every catalog neighbor', () => {
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(streamCard).toContain('Pay as they work.')
    expect(grantCard).toContain('A gift for a purpose.')
    for (const slug of [
      'scrip', 'boost', 'private-pay', 'closing', 'cover', 'inference', 'feed', 'registry', 'credit', 'handoff', 'vouch', 'kya',
      'vault-claim', 'job-escrow', 'trace', 'titles', 'names', 'memberships', 'datasets',
      'session', 'spend-policy', 'raffle', 'treasury', 'tickets', 'records',
      'receivables', 'grants', 'streampay', 'invoices'
    ]) {
      expect(catalog).toContain(`href="./${slug}/"`)
    }
  })

  it('uses an amber chip and adds the check desk to Pages without dropping the others', () => {
    expect(css).toContain('--seal: #b45309')
    expect(css).toContain('Fraunces')
    expect(catalogCss).toContain('.demo-check')
    expect(catalogCss).toContain('--chip: #b45309')
    expect(catalogCss).toContain('.demo-scrip')
    expect(catalogCss).toContain('.demo-inference')
    expect(catalogCss).toContain('--chip: #d97706')
    expect(pagesYml).toContain('# check-desk')
    expect(pagesYml).toContain('# scrip-desk')
    expect(pagesYml).toContain('# boost-desk')
    expect(pagesYml).toContain('# private-pay-desk')
    expect(pagesYml).toContain('# closing-desk')
    expect(pagesYml).toContain('# cover-desk')
    expect(pagesYml).toContain('check/frontend/package-lock.json')
    expect(pagesYml).toContain('site/check')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/check/')
    expect(pagesYml.match(/^  deploy:/gm)).toHaveLength(1)
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'feed', 'inference', 'cover', 'scenes', 'closing',
      'private-pay', 'boost', 'scrip', 'check'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
  })

  it('puts the business case under the head and above the form, and keeps it after a check runs', () => {
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const form = app.indexOf('{CHECK_JOB}')
    expect(caseMark).toBeGreaterThan(head)
    expect(form).toBeGreaterThan(caseMark)
    expect(app.slice(0, caseMark)).not.toContain('{active &&')
    expect(app.slice(0, caseMark)).not.toContain('{!active &&')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    expect(businessCase).toContain('<details')
    expect(businessCase).toContain('open={expanded}')
    expect(businessCase).toContain('<summary id="business-case-heading">{BUSINESS_CASE_TITLE}</summary>')
    expect(app.indexOf('{RECEIPT_NOTE}')).toBeGreaterThan(caseMark)
    expect(app.indexOf('{RECEIPT_NOTE}')).toBeLessThan(form)
    expect(businessCase).not.toContain(RECEIPT_NOTE)
    expect(checkCard).not.toContain('Business case')
    expect(app).toContain('id="verdict-flag"')
    expect(app).toContain('id="fee-lines"')
    expect(app).toContain('id="batch-results"')
    expect(app).toContain('id="public-book"')
    expect(app).toContain('id="batch-quote"')
  })

  it('says v0 is a lookup with receipts, and labels seed flags as demo data', () => {
    expect(RECEIPT_NOTE).toMatch(/does not move or hold the payment/)
    expect(LOCAL_NOTE).toMatch(/local simulation/)
    expect(LOCAL_NOTE).toMatch(/demo data/i)
    expect(DEMO_NOTE).toMatch(/[Dd]emo data/)
    expect(BATCH_QUOTE).toMatch(/[Qq]uote only/)
    expect(advanced).toContain('{LOCAL_NOTE}')
    expect(readme).toContain('does not move or hold the payment')
    expect(readme).toContain('demo data')
    expect(rootReadme).toContain(LEDE)
    expect(BUSINESS_CASE_MARKET).not.toMatch(/\$86/)
    expect(BUSINESS_CASE_MARKET).not.toMatch(/\$93/)
    expect(BUSINESS_CASE_WHY).not.toMatch(/\bBSV\b/)
    expect(CHECK_JOB).toMatch(/No wallet yet/)
  })

  it('keeps the banned whole words out of the rendered UI', () => {
    expect(rendered).not.toMatch(/\bguaranteed\b/i)
    expect(rendered).not.toMatch(/\binsured\b/i)
    expect(rendered).not.toMatch(/\bprotected\b/i)
    expect(BUSINESS_CASE_DEMO).toMatch(/does not guarantee payments/)
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
    expect(businessCase).toContain('{BUSINESS_CASE_TITLE}')
  })

  it('keeps the locked bodies verbatim', () => {
    expect(BUSINESS_CASE_WHY).toBe(
      'Money sent to the wrong payee rarely comes back: a swapped vendor bank detail, a lookalike address copied from history, or a first-time payee that turns out to be a scammer. Payers need a quick check before they sign, plus a receipt that shows the check happened.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Enterprise AP teams that screen vendor bank changes and batch payments, and wallets that want a warning before a send; grassroots treasurers and older users who want a warning before money leaves. Payers pay a small fee per check; enterprises subscribe for batch screening; reporters whose flag stops a payment earn a share.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'Pocket Universe / Kerberus (DefiLlama, Oct 2026): ~$31k / 30d, ~$361k over a year; claims 200k+ users and 3M+ transactions analyzed a week. Drainer and address-poisoning talk on X ~3.4k posts a week. AP payee-verification market size is unknown.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain analog: Pocket Universe / Kerberus — 200k+ users and a live fee on covered swaps (their fee bundles loss coverage; this desk does not).'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: bank Positive Pay and vendor bank-detail verification tools that AP teams already buy to stop payment-change fraud.'
    )
    expect(`${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`).toBe(BUSINESS_CASE_PROOF)
    expect(BUSINESS_CASE_DEMO).toBe(
      'A flagged lookalike payee gets a warning, a clean payee passes, and each check returns a receipt tied to the payment for a per-check fee. v0 is a risk lookup with receipts; it does not guarantee payments or cover losses.'
    )
  })
})
