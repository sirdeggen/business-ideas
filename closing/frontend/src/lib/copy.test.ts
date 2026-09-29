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
  LINE_BPS,
  LOCAL_ROLES_NOTE,
  OPEN_BUTTON,
  OPEN_JOB,
  PARTY_CHANGE_HELPER,
  PAYEE_HELPER,
  PRIMARY_COPY,
  PRODUCT,
  RECEIPT_NOTE,
  RECORD_BUTTON,
  RELEASE_JOB,
  SWAP_JOB,
  TITLE,
  payeeFlagLine
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
const cardStart = catalog.indexOf('id="closing-desk"')
const closingCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const streamStart = catalog.indexOf('href="./streampay/"')
const streamCard = catalog.slice(streamStart, catalog.indexOf('</article>', streamStart))
const grantStart = catalog.indexOf('href="./grants/"')
const grantCard = catalog.slice(grantStart, catalog.indexOf('</article>', grantStart))
const face = app.slice(0, app.indexOf('<details'))
const advanced = app.slice(app.indexOf('<details'))
const recordFn = app.slice(app.indexOf('const runRecord'), app.indexOf('const startOver'))
const openFn = app.slice(app.indexOf('const runOpen'), app.indexOf('const sourceHash'))

describe('first-paint copy', () => {
  it('names the desk and the job, not a protocol sentence', () => {
    expect(html).toContain('<title>Closing Desk</title>')
    expect(TITLE).toBe('Closing Desk')
    expect(PRODUCT).toBe('Closing Desk')
    expect(LEDE).toBe('A shared record of a purchase closing in sats. A changed payee is flagged on the receipt.')
    expect(OPEN_BUTTON).toBe('Open the closing')
    expect(RECORD_BUTTON).toBe('Record this closing')
    expect(app).toContain('{LEDE}')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
  })

  it('keeps one title and a quieter Closing eyebrow', () => {
    expect(EYEBROW).toBe('Closing')
    expect(app).toContain('className="eyebrow">{EYEBROW}<')
    expect(app).toContain('<h1>{TITLE}</h1>')
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect')
    expect(app).not.toContain('connect wallet')
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Live')
    expect(app).not.toContain('Open UI')
    expect(closingCard).toContain('class="badge">Server<')
    expect(closingCard).toContain('>View<')
    expect(closingCard).not.toContain('Live')
    expect(closingCard).not.toContain('Open UI')
  })

  it('keeps pass and hex off the face', () => {
    expect(face).not.toContain('Identity key')
    expect(face).not.toContain('02…')
    expect(face).not.toContain('03…')
    expect(face).not.toContain('shortKey(')
    expect(advanced).toContain('Amounts are in sats.')
    expect(advanced).toContain('Advanced')
    expect(advanced).toContain('shortKey(identityKey')
    expect(face).toContain('Install BSV Desktop')
    expect(face).toContain('const showInstall = walletMissing || actionNeedsInstall')
  })

  it('asks the wallet only when recording, after the closing is released', () => {
    expect(openFn).not.toContain('ensureWallet')
    expect(recordFn).toContain('const session = await ensureWallet()')
    expect(app.split('const session = await ensureWallet()')).toHaveLength(2)
    expect(app).toContain('isWalletMissing')
    expect(face.indexOf('{RECORD_JOB}')).toBeGreaterThan(face.indexOf('{RELEASE_JOB}'))
    expect(face.indexOf('{showInstall &&')).toBeGreaterThan(face.indexOf('{RECORD_JOB}'))
  })

  it('is one purchase closing, not a job and not a marketplace handoff', () => {
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/\bLive\b/)
    }
    expect(FOOTER).toMatch(/Not a job with milestones/)
    expect(FOOTER).toMatch(/Not a marketplace handoff/)
    expect(FOOTER).toMatch(/One purchase closing/)
    expect(app).not.toContain('Deliverable hash')
    expect(app).not.toContain('List an asset')
  })

  it('keeps the catalog card Server + View at the top of the ledger', () => {
    expect(closingCard).toContain('Closing Desk')
    expect(closingCard).toContain('A shared record of a purchase closing in sats. A changed payee is flagged on the receipt.')
    expect(closingCard).toContain('closing/README.md')
    expect(closingCard).toContain('scenes/closing.webp')
    expect(closingCard).toContain('How to run')
    const ledger = catalog.slice(catalog.indexOf('aria-label="Server"'), catalog.indexOf('aria-label="Live"'))
    expect(ledger.indexOf('href="./closing/"')).toBeLessThan(ledger.indexOf('href="./inference/"'))
    expect(ledger.indexOf('href="./inference/"')).toBeLessThan(ledger.indexOf('href="./feed/"'))
    expect(readme).toContain('# Closing Desk (v0)')
    expect(readme).toContain('tm_anytx')
    expect(readme).toContain('ls_anytx')
    expect(rootReadme).toContain('## Closing Desk\n')
    expect(html).toContain('<title>Closing Desk</title>')
    expect(readme).toContain('?c=<closingId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/c\/:id/)
  })

  it('leaves StreamPay and Grant receipt Live and keeps every catalog neighbor', () => {
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(streamCard).toContain('Pay as they work.')
    expect(grantCard).toContain('A gift for a purpose.')
    for (const slug of [
      'feed', 'inference', 'registry', 'credit', 'handoff', 'vouch', 'kya', 'vault-claim',
      'job-escrow', 'trace', 'titles', 'names', 'memberships', 'datasets',
      'session', 'spend-policy', 'raffle', 'treasury', 'tickets', 'records',
      'receivables', 'grants', 'streampay', 'invoices'
    ]) {
      expect(catalog).toContain(`href="./${slug}/"`)
    }
  })

  it('uses an indigo seal chip that does not copy another desk', () => {
    expect(css).toContain('--seal: #4338ca')
    expect(css).toContain('Fraunces')
    expect(catalogCss).toContain('.demo-closing')
    expect(catalogCss).toContain('--chip: #4338ca')
    expect(pagesYml).toContain('# closing-desk')
    expect(pagesYml).toContain('closing/frontend/package-lock.json')
    expect(pagesYml).toContain('site/closing')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/closing/')
    expect(pagesYml.match(/^  deploy:/gm)).toHaveLength(1)
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'feed', 'inference', 'scenes', 'closing'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
  })

  it('puts the business case under the job and above the form', () => {
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const form = app.indexOf('{OPEN_JOB}')
    expect(caseMark).toBeGreaterThan(head)
    expect(form).toBeGreaterThan(caseMark)
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    expect(app).not.toContain('{!open && <BusinessCase />}')
    expect(app.indexOf('{RECEIPT_NOTE}')).toBeGreaterThan(caseMark)
    expect(app.indexOf('{RECEIPT_NOTE}')).toBeLessThan(form)
    expect(businessCase).not.toContain(RECEIPT_NOTE)
    expect(closingCard).not.toContain('Business case')
  })

  it('says v0 records a receipt, and that approvals are local role clicks', () => {
    expect(RECEIPT_NOTE).toBe('This demo records and attests a shared closing receipt. It does not move funds.')
    expect(OPEN_JOB).not.toMatch(/\b(lock|hold|escrow)\w*/i)
    expect(RELEASE_JOB).toMatch(/flagged on it/)
    expect(SWAP_JOB).toMatch(/receipt flags the change/)
    expect(payeeFlagLine('Seller', 'Evil')).toBe('Payee change flagged: Seller is now Evil.')
    expect(app).toContain('id="payee-change-flag"')
    for (const line of [LEDE, OPEN_JOB, SWAP_JOB, RELEASE_JOB, RECEIPT_NOTE, PAYEE_HELPER, PARTY_CHANGE_HELPER, payeeFlagLine('Seller', 'Evil')]) {
      expect(line).not.toMatch(/\b(lock|locks|locked|hold|holds|holding|escrow|escrowed)\b/i)
    }
    expect(LINE_BPS).toBe('Fee (basis points, 100 = 1%)')
    expect(app).toContain('{LINE_BPS}')
    expect(app).not.toContain('Fee bps')
    expect(app).not.toContain("busy === 'open'")
    expect(app).not.toContain("busy === 'attest'")
    expect(app).not.toContain("busy === 'release'")
    expect(LOCAL_ROLES_NOTE).toMatch(/unsigned clicks on a role/)
    expect(LOCAL_ROLES_NOTE).toMatch(/SHA-256 of the name/)
    expect(advanced).toContain('{LOCAL_ROLES_NOTE}')
    expect(face).not.toContain('{LOCAL_ROLES_NOTE}')
    expect(readme).toContain('does not move funds')
    expect(readme).toContain('flags that change')
    expect(readme.replaceAll('Unlock', '')).not.toMatch(/\b(lock|locks|locked|hold|holds|holding|escrow|escrowed)\b/i)
    expect(readme).toContain('unsigned clicks on a role')
    expect(readme).toContain('SHA-256 of the name')
    expect(readme).not.toContain('Funds release only after')
    expect(readme).not.toContain('$500k')
    expect(rootReadme).toContain(LEDE)
    expect(rootReadme).not.toContain('$500k')
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
      'High-value purchases (property, mineral interests, domains, equipment) still get diverted by last-minute payee changes and fake wire instructions. Buyers and sellers need one shared record of who the payee is, which deed or document is being sold, and who approved the closing, so a changed payee stands out before anyone wires money.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Buyers, sellers, and closing agents on mid-to-high-ticket transfers; grassroots property buyers and enterprise mineral/real-estate desks that already pay escrow or title fees.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'Escrow.com publishes percentage escrow fees (roughly 0.89%–3.25% of transaction value). Traditional title/closing fees are commonly cited in the ~$1,200–$3,500 range for many residential closings. Prior Permian mineral wire-fraud research documented multi-million diversions and product gaps (bound payee, deed hash, multi-party release).'
    )
    expect(BUSINESS_CASE_PROOF).toBe(
      'Other-chain analog: thinner direct comps; Immunefi-style escrowed security payouts (~$75k/30d) show people pay for bonded release flows. Non-chain analog: Escrow.com fee schedule; title company closing fees for holding and releasing purchase funds.'
    )
    expect(`${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`).toBe(BUSINESS_CASE_PROOF)
    expect(BUSINESS_CASE_DEMO).toBe(
      'Record a closing with a bound payee, a deed/doc hash, and a seller attestation, collect multi-party approvals, and show a receipt that flags any payee change afterward, with the fee shown in bps. v0 records and attests; it does not hold or move funds.'
    )
  })
})
