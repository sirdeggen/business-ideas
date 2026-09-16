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
  DEFAULT_TITLE,
  EYEBROW,
  FOOTER,
  LEDE,
  AMOUNT_IN_ADVANCED,
  HOLDER_ONLY,
  LOOKUP_BUTTON,
  PRIMARY_COPY,
  REGISTER_BUTTON,
  RENEW_BUTTON,
  leasedLine,
  notFoundLine,
  sheetTitle
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const html = readFileSync(join(here, '../../index.html'), 'utf8')
const readme = readFileSync(join(here, '../../../README.md'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const cardStart = catalog.indexOf('href="./names/"')
const namesCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const face = app.slice(0, app.indexOf('<details'))
const business = readFileSync(join(here, '../BusinessCase.tsx'), 'utf8')

describe('first-paint copy', () => {
  it('names the job, not a protocol sentence', () => {
    expect(html).toContain('<title>Name lease</title>')
    expect(EYEBROW).toBe('Names')
    expect(DEFAULT_TITLE).toBe('Lease a name.')
    expect(LEDE).toBe('A name for a while. Look it up. Renew before it ends.')
    expect(LOOKUP_BUTTON).toBe('Look up')
    expect(REGISTER_BUTTON).toBe('Register')
    expect(RENEW_BUTTON).toBe('Renew')
    expect(sheetTitle(null)).toBe('Lease a name.')
    expect(sheetTitle('alice')).toBe('alice')
    expect(notFoundLine('alice')).toBe('alice is free.')
    expect(leasedLine('alice')).toBe('alice is leased.')
    expect(FOOTER).toBe('Not a contacts list. Not invoices.')
    expect(app).toContain('{EYEBROW}')
    expect(app).toContain('{LEDE}')
    expect(app).toContain('LOOKUP_BUTTON')
    expect(app).toContain('REGISTER_BUTTON')
    expect(app).toContain('RENEW_BUTTON')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('ENS')
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Connecting…')
    expect(app).not.toContain('Connect')
    expect(face).not.toContain('Live')
    expect(namesCard).toContain('class="badge">Server<')
    expect(namesCard).toContain('>View<')
    expect(namesCard).toContain('How to run')
    expect(namesCard).toContain(LEDE)
    expect(namesCard).toContain('A name for a while. Look it up. Renew before it ends.')
    expect(LEDE).toBe('A name for a while. Look it up. Renew before it ends.')
    expect(namesCard).not.toContain('Live')
    expect(namesCard).not.toContain('Open UI')
    expect(namesCard).not.toContain('sats')
    expect(namesCard).not.toContain('Business case')
  })

  it('keeps identity hex and sats off the face', () => {
    expect(face).not.toContain('identity key')
    expect(face).not.toContain('{identityKey}')
    expect(face).not.toContain('sats')
    expect(face).not.toContain('3,053,862')
    expect(app).toContain('<summary>Advanced</summary>')
    expect(app).toContain('formatSats(amountSats)')
    expect(app).toContain('shortKey(lease.lessee)')
    expect(app).toContain('shortKey(lease.txid')
  })

  it('asks the wallet only on Register and the holder’s Renew', () => {
    expect(app).toContain('const session = await ensureWallet()')
    expect(app).toContain('void runLease(\'register\')')
    expect(app).toContain('void runLease(\'renew\')')
    const lookupFn = app.slice(app.indexOf('const runLookup'), app.indexOf('const runLease'))
    expect(lookupFn).not.toContain('ensureWallet')
    expect(lookupFn).not.toContain('connect()')
    const beforeWallet = app.slice(app.indexOf('const runLease'), app.indexOf('const session = await ensureWallet()'))
    expect(beforeWallet).toContain('canOpenWalletForRenew')
    expect(beforeWallet).toContain('HOLDER_ONLY')
    expect(app).toContain('{showRenew &&')
    expect(app).toContain('{showHolderCopy &&')
    expect(app).toContain('{HOLDER_ONLY}')
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).toContain('DECLINED_SPEND')
  })

  it('hints Amount in Advanced when dollars are not on the face', () => {
    expect(AMOUNT_IN_ADVANCED).toBe('Amount in Advanced')
    expect(face).toContain('AMOUNT_IN_ADVANCED')
    expect(face).toContain('priceHint')
    expect(face).not.toContain('$—')
  })

  it('shares ?name= and stays off ENS pricing copy', () => {
    expect(app).toContain('goToName')
    expect(app).toContain('namePublicUrl')
    expect(app).not.toContain('/name/')
    expect(readme).toContain('?name=alice')
    expect(readme).toContain('query params')
    expect(app).not.toContain('/names/')
    expect(readme).toContain('satsPerDay')
    expect(readme).toContain('$3,053,862')
    expect(readme).toContain('cited')
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/\bLive\b/)
      expect(line).not.toMatch(/\bsats?\b/i)
      expect(line).not.toContain('ENS')
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
    expect(business).toContain('<h2 id="business-case-heading">{BUSINESS_CASE_TITLE}</h2>')
    expect(business.indexOf('Why it exists')).toBeLessThan(business.indexOf('Who pays'))
    expect(business.indexOf('Who pays')).toBeLessThan(business.indexOf('Market signal'))
    expect(business.indexOf('Market signal')).toBeLessThan(business.indexOf('Proof people pay'))
    expect(business.indexOf('Proof people pay')).toBeLessThan(business.indexOf('Demo goal'))
  })

  it('keeps the locked Revandrew PASS Page copy and does not dump Margaret or Sources', () => {
    expect(BUSINESS_CASE_WHY).toBe(
      'People and orgs need a human-readable name that resolves to something real for a while — look it up, use it, renew before it ends. A lease, not a forever land grab or a flip auction.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Builders, clubs, and enterprise namespaces that already buy renewable names (grassroots: project and community ops; enterprise: IT / brand / internal naming). Registrants pay the lease; the desk takes a fee on register/renew.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'ENS (DefiLlama, fetched Sep 2026): ~$325K fees in the last 30d; ~$4.0M trailing-year / annualized — registration + renewal only. Verisign (Q2 2026 earnings): $435M quarterly revenue; 179.1M combined .com/.net names in the base as of 30 Jun 2026 — people already pay for renewable names off-chain at scale.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain analog: ENS — renewable .eth leases with a live fee stream on DefiLlama.'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: Domain registrars / Verisign .com/.net subscriptions — orgs and people renew names every year.'
    )
    expect(BUSINESS_CASE_DEMO).toBe(
      'Pay a fixed-term lease → a stranger resolves the name to the right target on one URL → renew-before-expiry is visible (or expired fails) on that same visit. Fee and renew/fail proof explicit.'
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
    expect(business).not.toContain('Margaret')
    expect(business).not.toContain('## Sources')
    expect(business).not.toContain('Revandrew')
  })

  it('offers at most three citation chips for the inline market citations', () => {
    expect(BUSINESS_CASE_CITATIONS.length).toBeLessThanOrEqual(3)
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual([
      'DefiLlama Sep 2026',
      'Verisign Q2 2026'
    ])
  })

  it('sits once below the head and above the desk, visible without a wallet', () => {
    expect(app).toContain('<BusinessCase />')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const desk = app.indexOf('<section className="block">')
    const install = app.indexOf('{showInstall &&')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(desk).toBeGreaterThan(caseMark)
    expect(install).toBeGreaterThan(desk)
    expect(app).not.toContain('Connect wallet')

    expect(namesCard).toContain('class="badge">Server<')
    expect(namesCard).toContain('>View<')
    expect(namesCard).not.toContain('Live')
    expect(namesCard).not.toContain('Business case')
  })
})
