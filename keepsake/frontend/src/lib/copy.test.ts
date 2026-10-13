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
  LEDE,
  LOCAL_NOTE,
  OPEN_BUTTON,
  OPEN_JOB,
  PRIMARY_COPY,
  PRODUCT,
  RECEIPT_NOTE,
  RECORD_BUTTON,
  RECORD_JOB,
  RECIPIENT_LABEL,
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
const cardStart = catalog.indexOf('id="keepsake-desk"')
const keepsakeCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
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
    expect(html).toContain('<title>Keepsake Desk</title>')
    expect(TITLE).toBe('Keepsake Desk')
    expect(PRODUCT).toBe('Keepsake Desk')
    expect(LEDE).toBe('Mint a numbered keepsake. Send it to someone. They can keep it, show it, give it, or resell it.')
    expect(OPEN_BUTTON).toBe('Open the edition')
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

  it('keeps one title and a quieter Keepsake eyebrow', () => {
    expect(EYEBROW).toBe('Keepsake')
    expect(app).toContain('className="eyebrow">{EYEBROW}<')
    expect(app).toContain('<h1>{TITLE}</h1>')
  })

  it('asks the wallet only when recording', () => {
    expect(between(app, 'const runOpen', 'const runMint')).not.toContain('ensureWallet')
    expect(between(app, 'const runMint', 'const runSend')).not.toContain('ensureWallet')
    expect(between(app, 'const runSend', 'const runGift')).not.toContain('ensureWallet')
    expect(between(app, 'const runGift', 'const runShow')).not.toContain('ensureWallet')
    expect(between(app, 'const runShow', 'const runResell')).not.toContain('ensureWallet')
    expect(between(app, 'const runResell', 'const runRecord')).not.toContain('ensureWallet')
    expect(between(app, 'const runRecord', 'const startOver')).toContain('const session = await ensureWallet()')
    expect(app.split('const session = await ensureWallet()')).toHaveLength(2)
    expect(app).toContain('isWalletMissing')
    expect(face.indexOf('{RECORD_JOB}')).toBeGreaterThan(face.indexOf('{OPEN_JOB}'))
    expect(face.indexOf('{showInstall &&')).toBeGreaterThan(face.indexOf('{RECORD_JOB}'))
  })

  it('is a fixed numbered keepsake, distinct from grants, access, tickets, vaults, draws, and names', () => {
    expect(FOOTER).toBe('Not a grant, access key, ticket, vault claim, raffle, or name. One numbered piece from a fixed edition.')
    expect(FOOTER).toMatch(/grant/)
    expect(FOOTER).toMatch(/access key/)
    expect(FOOTER).toMatch(/ticket/)
    expect(FOOTER).toMatch(/vault claim/)
    expect(FOOTER).toMatch(/raffle/)
    expect(FOOTER).toMatch(/name/)
    expect(readme).toMatch(/not Grants/i)
    expect(readme).toMatch(/not Memberships/i)
    expect(readme).toMatch(/not Tickets/i)
    expect(readme).toMatch(/not Vault Claim/i)
    expect(readme).toMatch(/not Raffle/i)
    expect(readme).toMatch(/not Names/i)
    expect(readme).toMatch(/no packs/i)
    expect(readme).toMatch(/no random upgrades/i)
    expect(app).not.toContain('Deliverable hash')
  })

  it('keeps the catalog card Server + View at the top of the Server ledger', () => {
    expect(keepsakeCard).toContain('class="badge">Server<')
    expect(keepsakeCard).toContain('>View<')
    expect(keepsakeCard).not.toContain('Live')
    expect(keepsakeCard).not.toContain('Open UI')
    expect(keepsakeCard).toContain('Keepsake Desk')
    expect(keepsakeCard).toContain(LEDE)
    expect(keepsakeCard).toContain('keepsake/README.md')
    expect(keepsakeCard).toContain('scenes/keepsake.webp')
    expect(keepsakeCard).toContain(SCENE_ALT)
    expect(keepsakeCard).toContain('How to run')
    const ledger = catalog.slice(catalog.indexOf('aria-label="Server"'), catalog.indexOf('aria-label="Live"'))
    expect(ledger.indexOf('id="keepsake-desk"')).toBeLessThan(ledger.indexOf('id="check-desk"'))
    expect(ledger.indexOf('id="check-desk"')).toBeLessThan(ledger.indexOf('id="scrip-desk"'))
    expect(ledger.indexOf('id="scrip-desk"')).toBeLessThan(ledger.indexOf('id="boost-desk"'))
    expect(ledger.indexOf('id="boost-desk"')).toBeLessThan(ledger.indexOf('id="private-pay-desk"'))
    expect(ledger.indexOf('href="./keepsake/"')).toBeLessThan(ledger.indexOf('href="./scrip/"'))
    expect(readme).toContain('# Keepsake Desk (v0)')
    expect(readme).toContain('tm_anytx')
    expect(readme).toContain('ls_anytx')
    expect(rootReadme).toContain('## Keepsake Desk\n')
    expect(html).toContain('<title>Keepsake Desk</title>')
    expect(readme).toContain('?k=<keepsakeId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/k\/:id/)
    expect(catalog.match(/id="keepsake-desk"/g)).toHaveLength(1)
    expect(app).toContain('id="holder-view"')
    expect(app).toContain('id="resale-split"')
    expect(app).toContain('id="edition-cap"')
    expect(app).toContain('id="mint-line"')
    expect(app).toContain('id="send-line"')
  })

  it('leaves StreamPay and Grant receipt Live and keeps every catalog neighbor', () => {
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(streamCard).toContain('Pay as they work.')
    expect(grantCard).toContain('A gift for a purpose.')
    expect(catalog.match(/class="badge">Live</g)).toHaveLength(2)
    expect(app).toContain(`{RECIPIENT_LABEL}`)
    expect(RECIPIENT_LABEL).toBe('Recipient (identity key)')
    for (const slug of [
      'check', 'scrip', 'boost', 'private-pay', 'closing', 'cover', 'inference', 'feed', 'registry', 'credit', 'handoff', 'vouch', 'kya',
      'vault-claim', 'job-escrow', 'trace', 'titles', 'names', 'memberships', 'datasets',
      'session', 'spend-policy', 'raffle', 'treasury', 'tickets', 'records',
      'receivables', 'grants', 'streampay', 'invoices'
    ]) {
      expect(catalog).toContain(`href="./${slug}/"`)
    }
  })

  it('uses a fuchsia chip and adds the keepsake desk to Pages without dropping the others', () => {
    expect(css).toContain('--seal: #a21caf')
    expect(css).toContain('Newsreader')
    expect(catalogCss).toContain('.demo-keepsake')
    expect(catalogCss).toMatch(/\.demo-keepsake \{[^}]*--chip: #a21caf;/)
    expect(catalogCss).toMatch(/\.demo-keepsake \{[^}]*--title: #4a044e;/)
    expect(catalogCss.match(/#a21caf/g)).toHaveLength(1)
    expect(catalogCss).toContain('.demo-check')
    expect(catalogCss).toContain('--chip: #FFC800')
    expect(pagesYml.match(/# check-desk/g)).toHaveLength(3)
    expect(pagesYml).toContain('check/frontend/package-lock.json')
    expect(pagesYml).toContain('site/check')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/check/')
    expect(catalogCss).toContain('.demo-scrip')
    expect(catalogCss).toContain('.demo-boost')
    expect(catalogCss).toContain('.demo-private-pay')
    expect(pagesYml).toContain('# keepsake-desk')
    expect(pagesYml).toContain('# scrip-desk')
    expect(pagesYml).toContain('# boost-desk')
    expect(pagesYml).toContain('# private-pay-desk')
    expect(pagesYml).toContain('# closing-desk')
    expect(pagesYml).toContain('# cover-desk')
    expect(pagesYml.match(/# keepsake-desk/g)).toHaveLength(3)
    expect(pagesYml).toContain('keepsake/frontend/package-lock.json')
    expect(pagesYml).toContain('site/keepsake')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/keepsake/')
    expect(pagesYml.match(/^  deploy:/gm)).toHaveLength(1)
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'feed', 'inference', 'cover', 'scenes', 'closing',
      'private-pay', 'boost', 'scrip', 'check', 'keepsake'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
  })

  it('puts the business case under the head and above the form, and keeps it after an edition is open', () => {
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const form = app.indexOf('{OPEN_JOB}')
    expect(caseMark).toBeGreaterThan(head)
    expect(form).toBeGreaterThan(caseMark)
    expect(app.slice(0, caseMark)).not.toContain('{!edition &&')
    expect(app.slice(0, caseMark)).not.toContain('{edition &&')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    expect(businessCase).toContain('<details')
    expect(businessCase).toContain('open={expanded}')
    expect(businessCase).toContain('<summary id="business-case-heading">{BUSINESS_CASE_TITLE}</summary>')
    expect(app.indexOf('{RECEIPT_NOTE}')).toBeGreaterThan(caseMark)
    expect(app.indexOf('{RECEIPT_NOTE}')).toBeLessThan(form)
    expect(businessCase).not.toContain(RECEIPT_NOTE)
    expect(keepsakeCard).not.toContain('Business case')
    expect(app).toContain('id="public-book"')
  })

  it('says the desk records the split and what stays desk state', () => {
    expect(RECEIPT_NOTE).toMatch(/computes and records/)
    expect(RECEIPT_NOTE).toMatch(/does not move the sale sats/)
    expect(RECEIPT_NOTE).not.toMatch(/locking script/)
    expect(face).toContain('{RECEIPT_NOTE}')
    expect(face).not.toContain('{SCRIPT_LINE}')
    expect(face.match(/receipt-note/g)).toHaveLength(1)
    expect(LOCAL_NOTE).toMatch(/desk state until you record/)
    expect(LOCAL_NOTE).toMatch(/does not move resale sats/)
    expect(LOCAL_NOTE).toMatch(/no packs and no random upgrades/)
    expect(advanced).toContain('{LOCAL_NOTE}')
    expect(readme).toContain('computes and records')
    expect(readme).toContain('OP_CHECKSIG')
    expect(readme).toContain('OP_PUSH_TX')
    expect(readme).not.toMatch(/script checks/i)
    expect(readme).not.toContain('OP_MUL')
    expect(readme).toContain('desk state')
    expect(rootReadme).toContain(LEDE)
    expect(BUSINESS_CASE_MARKET).not.toMatch(/Other-chain analog only/)
    expect(BUSINESS_CASE_PROOF_CHAIN).toMatch(/Fragment fees across all products/)
    expect(BUSINESS_CASE_PROOF_CHAIN).not.toMatch(/digital gifts/)
    expect(BUSINESS_CASE_DEMO).toMatch(/computes and records/)
    expect(BUSINESS_CASE_DEMO).not.toMatch(/\b(BSV|sats|script|overlay|wallet|enforces)\b/i)
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
      'An org mints a fixed number of keepsakes: a volunteer award, a service year, an opening night, or a donor thank-you. The holder can keep it, show it, give it on, or resell it. The edition is fixed: no packs and no random upgrades.'
    )
    expect(BUSINESS_CASE_WHY).not.toMatch(/Enterprises want/)
    expect(BUSINESS_CASE_WHO).toBe(
      'The org pays a mint fee per piece: companies, campuses, venues, and volunteer groups. On a resale, the buyer pays the price. The desk records a cut under 5% and an issuer royalty.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'Fragment, Telegram\'s marketplace on TON (DefiLlama, 2026-10-13): ~$32.2M user fees / 30d across Stars, Ads, Premium, usernames and Gifts; the Gifts-only share is unknown. Fragment takes 5% on collectible sales; Telegram\'s own gift market keeps 20% of a Stars price. Telegram Gifts on X: 604 posts / 7d.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Fragment fees across all products (DefiLlama, 2026-10-13): ~$32.2M user fees / 30d. Fragment takes 5% on collectible sales.'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: service-year awards, donor thank-you plaques, opening-night programs, and volunteer certificates — orgs already pay to issue a scarce numbered thank-you.'
    )
    expect(`${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`).toBe(BUSINESS_CASE_PROOF)
    expect(BUSINESS_CASE_DEMO).toBe(
      'An org opens a fixed edition, mints a numbered keepsake, and sends it to a recipient, who can see it. A resale shows the issuer royalty and the desk cut. v0 computes and records the royalty and publishes the edition count; it does not run checkout for the sale.'
    )
  })
})
