import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ATTESTING_BUTTON,
  ATTEST_BUTTON,
  BAND_LINE,
  BUSINESS_CASE_CITATIONS,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
  EXPORT_BUTTON,
  EYEBROW,
  FEE_FACE,
  GRANTING_BUTTON,
  GRANT_BUTTON,
  GRANT_FEE_LABEL,
  HONESTY_LINE,
  JOB,
  OPENING_BUTTON,
  OPEN_BUTTON,
  PAYING_BUTTON,
  PAYMENT_FEE_LABEL,
  PAY_BUTTON,
  PRODUCT,
  REVOKING_BUTTON,
  REVOKE_BUTTON,
  SCENE_ALT,
  STRANGER_LINE
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const css = readFileSync(join(here, '../index.css'), 'utf8')
const html = readFileSync(join(here, '../../index.html'), 'utf8')
const readme = readFileSync(join(here, '../../../README.md'), 'utf8')
const rootReadme = readFileSync(join(here, '../../../../README.md'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const catalogCss = readFileSync(join(here, '../../../../pages/styles.css'), 'utf8')
const pagesYml = readFileSync(join(here, '../../../../.github/workflows/pages.yml'), 'utf8')

const BANNED = /mixer|anonymity set|tumbler|hide from the chain/i

function card(href: string): string {
  const start = catalog.indexOf(`href="${href}"`)
  return catalog.slice(start, catalog.indexOf('</article>', start))
}

const payCard = card('./private-pay/')
const streamCard = card('./streampay/')
const grantCard = card('./grants/')
const face = app.slice(0, app.indexOf('<details'))

describe('first-paint copy', () => {
  it('names Private Pay Desk and the payment job', () => {
    expect(html).toContain('<title>Private Pay Desk</title>')
    expect(PRODUCT).toBe('Private Pay Desk')
    expect(JOB).toBe('Confidential payments for payroll and suppliers. An auditor sees only the view they were granted.')
    expect(app).toContain('{PRODUCT}')
    expect(app).toContain('{JOB}')
    expect(EYEBROW).toBe('Private pay')
    expect(PAY_BUTTON).toBe('Pay')
    expect(ATTEST_BUTTON).toBe('Attest')
    expect(GRANT_BUTTON).toBe('Grant view')
    expect(REVOKE_BUTTON).toBe('Revoke view')
    expect(OPEN_BUTTON).toBe('Open view')
    expect(EXPORT_BUTTON).toBe('Export reading')
    expect(PAYING_BUTTON).toBe('Paying…')
    expect(ATTESTING_BUTTON).toBe('Attesting…')
    expect(GRANTING_BUTTON).toBe('Granting view…')
    expect(REVOKING_BUTTON).toBe('Revoking view…')
    expect(OPENING_BUTTON).toBe('Opening view…')
    expect(PAYMENT_FEE_LABEL).toBe('Payment fee')
    expect(GRANT_FEE_LABEL).toBe('Audit-view grant fee')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('Approve in wallet')
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('connect wallet')
    expect(app).not.toContain('>Live<')
    expect(payCard).toContain('class="badge">Server<')
    expect(payCard).toContain('>View<')
    expect(payCard).not.toContain('Live')
    expect(payCard).not.toContain('Open UI')
  })

  it('shows the quote and the labeled fees without a wallet', () => {
    expect(face).toContain('{PAYMENT_FEE_LABEL}')
    expect(face).toContain('{GRANT_FEE_LABEL}')
    expect(face).toContain('{FEE_FACE}')
    expect(face).toContain('{BAND_LINE}')
    expect(face).toContain('{STRANGER_LINE}')
    expect(face).toContain('{EXPORT_BUTTON}')
    expect(face).toContain('grantFeeFace()')
    expect(FEE_FACE).toContain('basis points')
    expect(BAND_LINE).toContain('400 sats')
    expect(HONESTY_LINE).toContain('sealed')
    expect(STRANGER_LINE).toContain('No wallet')
    const exportFn = app.slice(app.indexOf('const runExport'))
    expect(exportFn.slice(0, exportFn.indexOf('const copyLink'))).not.toContain('ensureWallet')
  })

  it('uses busy labels on Pay, Attest, Grant view, Revoke view, and Open view', () => {
    expect(app).toContain('busy === \'pay\' ? PAYING_BUTTON : PAY_BUTTON')
    expect(app).toContain('busy === \'attest\' ? ATTESTING_BUTTON : ATTEST_BUTTON')
    expect(app).toContain('busy === \'grant\' ? GRANTING_BUTTON : GRANT_BUTTON')
    expect(app).toContain('busy === \'revoke\' ? REVOKING_BUTTON : REVOKE_BUTTON')
    expect(app).toContain('busy === \'open\' ? OPENING_BUTTON : OPEN_BUTTON')
  })

  it('asks the wallet only on Pay, Attest, Grant view, Revoke view, and Open view', () => {
    expect(app.split('const session = await ensureWallet()')).toHaveLength(6)
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('isWalletMissing')
    expect(app).toContain('scrollIntoView')
  })

  it('keeps the catalog card Server + View and the prior Live badges', () => {
    expect(payCard).toContain('Private Pay Desk')
    expect(payCard).toContain(JOB)
    expect(payCard).toContain('private-pay/README.md')
    expect(payCard).toContain('scenes/private-pay.webp')
    expect(payCard).toContain('How to run')
    expect(payCard).toContain('class="badge">Server<')
    expect(payCard).toContain('>View<')
    expect(payCard).not.toContain('Live')
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(streamCard).toContain('Pay as they work.')
    expect(grantCard).toContain('A gift for a purpose.')
    expect(readme).toContain('# Private Pay Desk (v0)')
    expect(readme).toContain('Distinct from Spend Policy / Treasury')
    expect(readme).toContain('What is paid vs attested')
    expect(readme).toContain('What a stranger can read')
    expect(rootReadme).toContain('## Private Pay Desk\n')
    expect(html).toContain('<title>Private Pay Desk</title>')
    expect(readme).toContain('?p=<paymentId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/p\/:id/)
    expect(catalog.indexOf('href="./private-pay/"')).toBeLessThan(catalog.indexOf('href="./closing/"'))
    expect(catalog.indexOf('href="./closing/"')).toBeLessThan(catalog.indexOf('href="./cover/"'))
    expect(payCard).toContain(SCENE_ALT)
    expect(app).toContain(SCENE_ALT)
    expect([app, readme, rootReadme, payCard].join('\n')).not.toMatch(BANNED)
  })

  it('adds private pay to Pages without dropping earlier desks', () => {
    expect(catalogCss).toContain('.demo-private-pay')
    expect(css).toContain('--seal:')
    expect(css).toContain('Fraunces')
    expect(pagesYml.match(/# private-pay-desk/g)).toHaveLength(3)
    expect(pagesYml.match(/# closing-desk/g)).toHaveLength(3)
    expect(pagesYml.match(/# cover-desk/g)).toHaveLength(3)
    expect(pagesYml).toContain('private-pay/frontend/package-lock.json')
    expect(pagesYml).toContain('closing/frontend/package-lock.json')
    expect(pagesYml).toContain('cover/frontend/package-lock.json')
    expect(pagesYml).toContain('site/private-pay')
    expect(pagesYml).toContain('site/closing')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/private-pay/')
    expect(pagesYml).toContain('site/cover site/closing site/private-pay')
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'feed', 'inference', 'cover', 'closing',
      'private-pay', 'scenes'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
    for (const href of [
      './tickets/', './receivables/', './invoices/', './treasury/', './streampay/',
      './grants/', './records/', './raffle/', './spend-policy/', './session/',
      './datasets/', './memberships/', './names/', './titles/', './trace/',
      './job-escrow/', './vault-claim/', './kya/', './vouch/', './handoff/',
      './credit/', './registry/', './feed/', './inference/', './cover/',
      './closing/', './private-pay/'
    ]) {
      expect(catalog).toContain(`href="${href}"`)
    }
  })

  it('shows Business case once below the head, above the desk, without a wallet', () => {
    expect(app).toContain('<BusinessCase />')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{JOB}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const desk = app.indexOf('{!paymentId && (')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(desk).toBeGreaterThan(caseMark)
    const rendered = app.slice(app.lastIndexOf('return ('))
    expect(rendered.slice(0, rendered.indexOf('<BusinessCase />'))).not.toContain('ensureWallet')
    expect(rendered.slice(0, rendered.indexOf('<BusinessCase />'))).not.toContain('connect()')
  })
})

describe('Business case page copy is locked', () => {
  it('uses the exact title, five fields, and seed figures', () => {
    expect(BUSINESS_CASE_TITLE).toBe('Business case')
    expect([...BUSINESS_CASE_FIELDS]).toEqual([
      'Why it exists',
      'Who pays',
      'Market signal',
      'Proof people pay',
      'Demo goal'
    ])
    expect(BUSINESS_CASE_WHY.startsWith('Payroll amounts and supplier prices')).toBe(true)
    expect(BUSINESS_CASE_WHO.startsWith('Finance and compliance teams')).toBe(true)
    expect(BUSINESS_CASE_MARKET).toContain('$377k')
    expect(BUSINESS_CASE_MARKET).toContain('$144k')
    expect(BUSINESS_CASE_MARKET).toContain('11,500')
    expect(BUSINESS_CASE_MARKET).toContain('DefiLlama, 2026-10-06')
    expect(BUSINESS_CASE_PROOF_CHAIN.startsWith('Other-chain analog:')).toBe(true)
    expect(BUSINESS_CASE_PROOF_FIAT.startsWith('Non-chain analog:')).toBe(true)
    expect(BUSINESS_CASE_PROOF_CHAIN).toContain('0.25%')
    expect(BUSINESS_CASE_PROOF_CHAIN).toContain('Railgun')
    expect(BUSINESS_CASE_PROOF_CHAIN).toContain('Privacy Cash')
    expect(BUSINESS_CASE_DEMO.startsWith('A payer sends a confidential payment')).toBe(true)
    const businessCase = readFileSync(join(here, '../BusinessCase.tsx'), 'utf8')
    expect(businessCase).toContain('BUSINESS_CASE_FIELDS.map')
    expect(businessCase).toContain('<dt>{label}</dt>')
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual(['DefiLlama, 2026-10-06'])
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
    expect(joined).not.toMatch(/\bBSV\b/)
    expect(joined).not.toMatch(BANNED)
    expect(joined.split('\n')[0]).not.toMatch(/wallet/i)
    expect(BUSINESS_CASE_WHY.split('.')[0]).not.toMatch(/\bBSV\b/)
    expect(BUSINESS_CASE_WHO.split('.')[0]).not.toMatch(/\bBSV\b/)
    expect(BUSINESS_CASE_DEMO.split('.')[0]).not.toMatch(/\bBSV\b/)
  })
})
