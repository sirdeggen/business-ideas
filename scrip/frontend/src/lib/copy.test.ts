import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
  EYEBROW,
  FOOTER,
  ISSUE_BUTTON,
  ISSUE_JOB,
  LEDE,
  LOCAL_NOTE,
  PRIMARY_COPY,
  PRODUCT,
  RECEIPT_NOTE,
  RECORD_BUTTON,
  RECORD_JOB,
  TITLE,
  YIELD_SHARE_LINE
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
const cardStart = catalog.indexOf('id="scrip-desk"')
const scripCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
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
    expect(html).toContain('<title>Scrip Desk</title>')
    expect(TITLE).toBe('Scrip Desk')
    expect(PRODUCT).toBe('Scrip Desk')
    expect(LEDE).toBe('Issue a branded balance. Post the reserve that backs it. Redeem on demand.')
    expect(ISSUE_BUTTON).toBe('Issue the brand')
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

  it('keeps one title and a quieter Scrip eyebrow', () => {
    expect(EYEBROW).toBe('Scrip')
    expect(app).toContain('className="eyebrow">{EYEBROW}<')
    expect(app).toContain('<h1>{TITLE}</h1>')
  })

  it('asks the wallet only when recording', () => {
    expect(between(app, 'const runIssue', 'const runMint')).not.toContain('ensureWallet')
    expect(between(app, 'const runMint', 'const runAttest')).not.toContain('ensureWallet')
    expect(between(app, 'const runAttest', 'const runRedeem')).not.toContain('ensureWallet')
    expect(between(app, 'const runRedeem', 'const runRecord')).not.toContain('ensureWallet')
    expect(between(app, 'const runRecord', 'const startOver')).toContain('const session = await ensureWallet()')
    expect(app.split('const session = await ensureWallet()')).toHaveLength(2)
    expect(app).toContain('isWalletMissing')
    expect(face.indexOf('{RECORD_JOB}')).toBeGreaterThan(face.indexOf('{ISSUE_JOB}'))
    expect(face.indexOf('{showInstall &&')).toBeGreaterThan(face.indexOf('{RECORD_JOB}'))
  })

  it('is branded stored value, distinct from vault spending, access keys, and payment flows', () => {
    expect(FOOTER).toMatch(/Not dual-control spending/)
    expect(FOOTER).toMatch(/Not a timed access key/)
    expect(FOOTER).toMatch(/Not a continuous payment/)
    expect(readme).toMatch(/not Treasury/i)
    expect(readme).toMatch(/not Memberships/i)
    expect(readme).toMatch(/not StreamPay/i)
    expect(readme).toMatch(/not Registry/i)
    expect(readme).toMatch(/not Vault Claim/i)
    expect(app).not.toContain('Deliverable hash')
  })

  it('keeps the catalog card Server + View at the top of the Server ledger', () => {
    expect(scripCard).toContain('class="badge">Server<')
    expect(scripCard).toContain('>View<')
    expect(scripCard).not.toContain('Live')
    expect(scripCard).not.toContain('Open UI')
    expect(scripCard).toContain('Scrip Desk')
    expect(scripCard).toContain(LEDE)
    expect(scripCard).toContain('scrip/README.md')
    expect(scripCard).toContain('scenes/scrip.webp')
    expect(scripCard).toContain('How to run')
    const ledger = catalog.slice(catalog.indexOf('aria-label="Server"'), catalog.indexOf('aria-label="Live"'))
    expect(ledger.indexOf('id="scrip-desk"')).toBeLessThan(ledger.indexOf('id="boost-desk"'))
    expect(ledger.indexOf('id="boost-desk"')).toBeLessThan(ledger.indexOf('id="private-pay-desk"'))
    expect(ledger.indexOf('id="private-pay-desk"')).toBeLessThan(ledger.indexOf('id="closing-desk"'))
    expect(ledger.indexOf('href="./scrip/"')).toBeLessThan(ledger.indexOf('href="./closing/"'))
    expect(ledger.indexOf('href="./closing/"')).toBeLessThan(ledger.indexOf('href="./cover/"'))
    expect(readme).toContain('# Scrip Desk (v0)')
    expect(readme).toContain('tm_anytx')
    expect(readme).toContain('ls_anytx')
    expect(rootReadme).toContain('## Scrip Desk\n')
    expect(html).toContain('<title>Scrip Desk</title>')
    expect(readme).toContain('?s=<scripId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/s\/:id/)
    expect(catalog.match(/id="scrip-desk"/g)).toHaveLength(1)
  })

  it('leaves StreamPay and Grant receipt Live and keeps every catalog neighbor', () => {
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(streamCard).toContain('Pay as they work.')
    expect(grantCard).toContain('A gift for a purpose.')
    for (const slug of [
      'boost', 'private-pay', 'closing', 'cover', 'inference', 'feed', 'registry', 'credit', 'handoff', 'vouch', 'kya',
      'vault-claim', 'job-escrow', 'trace', 'titles', 'names', 'memberships', 'datasets',
      'session', 'spend-policy', 'raffle', 'treasury', 'tickets', 'records',
      'receivables', 'grants', 'streampay', 'invoices'
    ]) {
      expect(catalog).toContain(`href="./${slug}/"`)
    }
  })

  it('uses an emerald chip and adds the scrip desk to Pages without dropping the others', () => {
    expect(css).toContain('--seal: #059669')
    expect(css).toContain('Fraunces')
    expect(catalogCss).toContain('.demo-scrip')
    expect(catalogCss).toContain('--chip: #059669')
    expect(catalogCss).toContain('.demo-closing')
    expect(pagesYml).toContain('# scrip-desk')
    expect(pagesYml).toContain('# boost-desk')
    expect(pagesYml).toContain('# private-pay-desk')
    expect(pagesYml).toContain('# closing-desk')
    expect(pagesYml).toContain('# cover-desk')
    expect(pagesYml).toContain('# inference-desk')
    expect(pagesYml).toContain('scrip/frontend/package-lock.json')
    expect(pagesYml).toContain('site/scrip')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/scrip/')
    expect(pagesYml.match(/^  deploy:/gm)).toHaveLength(1)
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'feed', 'inference', 'cover', 'scenes', 'closing',
      'private-pay', 'boost', 'scrip'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
  })

  it('puts the business case under the head and above the form, and keeps it after a brand is open', () => {
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const form = app.indexOf('{ISSUE_JOB}')
    expect(caseMark).toBeGreaterThan(head)
    expect(form).toBeGreaterThan(caseMark)
    expect(app.slice(0, caseMark)).not.toContain('{!issue &&')
    expect(app.slice(0, caseMark)).not.toContain('{issue &&')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    expect(businessCase).toContain('<details')
    expect(businessCase).toContain('open={expanded}')
    expect(businessCase).toContain('<summary id="business-case-heading">{BUSINESS_CASE_TITLE}</summary>')
    expect(app.indexOf('{RECEIPT_NOTE}')).toBeGreaterThan(caseMark)
    expect(app.indexOf('{RECEIPT_NOTE}')).toBeLessThan(form)
    expect(businessCase).not.toContain(RECEIPT_NOTE)
    expect(scripCard).not.toContain('Business case')
    expect(app).toContain('id="coverage-flag"')
    expect(app).toContain('id="redeem-block"')
    expect(app).toContain('id="public-book"')
  })

  it('says v0 attests and records, and does not claim custody', () => {
    expect(RECEIPT_NOTE).toMatch(/does not hold custody or move reserves/)
    expect(LOCAL_NOTE).toMatch(/not a bank API/)
    expect(LOCAL_NOTE).toMatch(/not a bank-grade custodian/)
    expect(LOCAL_NOTE).toMatch(/not FDIC insurance/)
    expect(LOCAL_NOTE).toMatch(/not a licensed trust/)
    expect(YIELD_SHARE_LINE).toMatch(/no yield oracle/)
    expect(advanced).toContain('{LOCAL_NOTE}')
    expect(face).toContain('{YIELD_SHARE_LINE}')
    expect(readme).toContain('does not hold custody')
    expect(readme).toContain('not a bank API')
    expect(readme).toContain('not a bank-grade custodian')
    expect(rootReadme).toContain(LEDE)
    expect(BUSINESS_CASE_MARKET).not.toMatch(/Tether|Circle/)
    expect(BUSINESS_CASE_WHY).not.toMatch(/\bBSV\b/)
    expect(LEDE).not.toMatch(/\bBSV\b/)
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
      'Festival organizers, co-ops, schools, and campuses already run branded balances, but members cannot see whether the float is backed and redeem is often a phone call. Issuers need a public reserve attestation tied to mint and redeem so a holder can check coverage and cash out on demand.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Credit unions, festivals, co-ops, schools, and enterprise campuses that already issue branded stored value. Holders spend the balance; the buyer is the issuer that pays setup plus mint/redeem fees or a small share of reserve yield.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'Paxos issuer (DefiLlama, 2026-10-06): ~$9.21M retained / 30d from reserve yield on issued dollars (white-label PYUSD / USDG partner economics). Ethena Whitelabel (jupUSD, USDm, ether.fi USD): partner keeps most reserve yield. Proof-of-reserves on X ~1.6k posts / 7d. Share that is grassroots festival / campus scrip vs dollar issuers is unknown.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain analog: Paxos / Ethena Whitelabel — partners already share reserve-yield economics on branded dollars with public reserve attestation.'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: campus cash, festival scrip, co-op gift cards, credit-union prepaid — orgs already issue branded stored value and take float or reload fees.'
    )
    expect(`${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`).toBe(BUSINESS_CASE_PROOF)
    expect(BUSINESS_CASE_DEMO).toBe(
      'Issuer posts a reserve attestation, mints branded balances, shows coverage after mints, and redeems on demand with a receipt. v0 attests and records mint/redeem; it is not a bank-grade custodian.'
    )
  })
})
