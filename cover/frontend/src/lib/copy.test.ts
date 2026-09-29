import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  APPROVE_BUTTON,
  APPROVING_BUTTON,
  BUSINESS_CASE_CITATIONS,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
  BUYING_BUTTON,
  BUY_BUTTON,
  CLAIM_ADMIN_LABEL,
  EXPORT_BUTTON,
  EYEBROW,
  FEE_FACE,
  FILE_BUTTON,
  FILING_BUTTON,
  JOB,
  PAYOUT_NOTE,
  PREMIUM_CUT_LABEL,
  PRODUCT,
  RELEASED_WORD,
  RELEASE_BUTTON,
  RELEASING_BUTTON,
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

function card(href: string): string {
  const start = catalog.indexOf(`href="${href}"`)
  return catalog.slice(start, catalog.indexOf('</article>', start))
}

const coverCard = card('./cover/')
const streamCard = card('./streampay/')
const grantCard = card('./grants/')
const face = app.slice(0, app.indexOf('<details'))

describe('first-paint copy', () => {
  it('names Cover Desk and the cover job', () => {
    expect(html).toContain('<title>Cover Desk</title>')
    expect(PRODUCT).toBe('Cover Desk')
    expect(JOB).toBe('Buy cover. Get a policy record. File a claim that releases only when the right people agree.')
    expect(app).toContain('{PRODUCT}')
    expect(app).toContain('{JOB}')
    expect(EYEBROW).toBe('Cover')
    expect(BUY_BUTTON).toBe('Buy cover')
    expect(FILE_BUTTON).toBe('File claim')
    expect(APPROVE_BUTTON).toBe('Approve')
    expect(RELEASE_BUTTON).toBe('Release')
    expect(EXPORT_BUTTON).toBe('Export reading')
    expect(BUYING_BUTTON).toBe('Buying cover…')
    expect(FILING_BUTTON).toBe('Filing claim…')
    expect(APPROVING_BUTTON).toBe('Approving…')
    expect(RELEASING_BUTTON).toBe('Releasing…')
    expect(PREMIUM_CUT_LABEL).toBe('Premium cut')
    expect(CLAIM_ADMIN_LABEL).toBe('Claim-admin fee')
    expect(RELEASED_WORD).toBe('Released')
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
    expect(coverCard).toContain('class="badge">Server<')
    expect(coverCard).toContain('>View<')
    expect(coverCard).not.toContain('Live')
    expect(coverCard).not.toContain('Open UI')
  })

  it('shows the quote and the labeled fees without a wallet', () => {
    expect(face).toContain('{PREMIUM_LABEL}')
    expect(face).toContain('{PREMIUM_CUT_LABEL}')
    expect(face).toContain('{FEE_FACE}')
    expect(face).toContain('{STRANGER_LINE}')
    expect(face).toContain('{EXPORT_BUTTON}')
    expect(face).toContain('{CLAIM_ADMIN_LABEL}')
    expect(face).toContain('{RELEASED_WORD}')
    expect(face).toContain('claimAdminFace()')
    expect(FEE_FACE).toContain('desk fee')
    expect(PAYOUT_NOTE).toContain('does not hold')
    expect(STRANGER_LINE).toContain('No wallet')
    const exportFn = app.slice(app.indexOf('const runExport'))
    expect(exportFn.slice(0, exportFn.indexOf('const runOpen'))).not.toContain('ensureWallet')
  })

  it('uses busy labels on Buy, File, Approve, and Release', () => {
    expect(app).toContain('busy === \'buy\' ? BUYING_BUTTON : BUY_BUTTON')
    expect(app).toContain('busy === \'claim\' ? FILING_BUTTON : FILE_BUTTON')
    expect(app).toContain('busy === \'approve\' ? APPROVING_BUTTON : APPROVE_BUTTON')
    expect(app).toContain('busy === \'release\' ? RELEASING_BUTTON : RELEASE_BUTTON')
    for (const label of [
      BUYING_BUTTON, FILING_BUTTON, APPROVING_BUTTON, RELEASING_BUTTON,
      BUY_BUTTON, FILE_BUTTON, APPROVE_BUTTON, RELEASE_BUTTON, EXPORT_BUTTON
    ]) {
      expect(label.toLowerCase()).not.toContain('wallet')
      expect(label.toLowerCase()).not.toContain('approve in')
    }
  })

  it('asks the wallet only on Buy, File claim, Approve, and Release', () => {
    expect(app.split('const session = await ensureWallet()')).toHaveLength(5)
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('isWalletMissing')
    expect(app).toContain('scrollIntoView')
  })

  it('keeps the catalog card Server + View and the prior Live badges', () => {
    expect(coverCard).toContain('Cover Desk')
    expect(coverCard).toContain(JOB)
    expect(coverCard).toContain('cover/README.md')
    expect(coverCard).toContain('scenes/cover.webp')
    expect(coverCard).toContain('How to run')
    expect(coverCard).toContain('class="badge">Server<')
    expect(coverCard).toContain('>View<')
    expect(coverCard).not.toContain('Live')
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(streamCard).toContain('Pay as they work.')
    expect(grantCard).toContain('A gift for a purpose.')
    expect(readme).toContain('# Cover Desk (v0)')
    expect(readme).toContain('Distinct from Vouch / Credit / Grants')
    expect(readme).toContain('What is on-chain vs attested')
    expect(rootReadme).toContain('## Cover Desk\n')
    expect(html).toContain('<title>Cover Desk</title>')
    expect(readme).toContain('?p=<policyId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/p\/:id/)
    expect(catalog.indexOf('href="./cover/"')).toBeLessThan(catalog.indexOf('href="./feed/"'))
  })

  it('adds cover to Pages without dropping earlier desks', () => {
    expect(catalogCss).toContain('.demo-cover')
    expect(css).toContain('--seal:')
    expect(css).toContain('Newsreader')
    expect(css).not.toContain('#0c7a5c')
    expect(css).not.toContain('#1f3a5f')
    expect(css).not.toContain('#84cc16')
    expect(css).not.toContain('#7c3aed')
    expect(css).not.toContain('#06b6d4')
    expect(pagesYml.match(/# cover-desk/g)).toHaveLength(3)
    expect(pagesYml).toContain('# credit-desk')
    expect(pagesYml).toContain('# registry-desk')
    expect(pagesYml).toContain('cover/frontend/package-lock.json')
    expect(pagesYml).toContain('feed/frontend/package-lock.json')
    expect(pagesYml).toContain('registry/frontend/package-lock.json')
    expect(pagesYml).toContain('credit/frontend/package-lock.json')
    expect(pagesYml).toContain('site/cover')
    expect(pagesYml).toContain('site/feed')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/cover/')
    expect(pagesYml).toContain('site/handoff site/credit site/registry site/scenes')
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'feed', 'cover', 'scenes'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
    for (const href of [
      './tickets/', './receivables/', './invoices/', './treasury/', './streampay/',
      './grants/', './records/', './raffle/', './spend-policy/', './session/',
      './datasets/', './memberships/', './names/', './titles/', './trace/',
      './job-escrow/', './vault-claim/', './kya/', './vouch/', './handoff/',
      './credit/', './registry/', './feed/', './cover/'
    ]) {
      expect(catalog).toContain(`href="${href}"`)
    }
    const feedCard = card('./feed/')
    expect(feedCard).toContain('Feed Desk')
    expect(feedCard).toContain('class="badge">Server<')
    expect(feedCard).not.toContain('Live')
  })

  it('shows Business case once below the head, above the desk, without a wallet', () => {
    expect(app).toContain('<BusinessCase />')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{JOB}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const desk = app.indexOf('{!policyId && (')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(desk).toBeGreaterThan(caseMark)
    const rendered = app.slice(app.lastIndexOf('return ('))
    expect(rendered.slice(0, rendered.indexOf('<BusinessCase />'))).not.toContain('ensureWallet')
    expect(rendered.slice(0, rendered.indexOf('<BusinessCase />'))).not.toContain('connect()')
  })
})

describe('Business case page copy is locked', () => {
  it('uses the exact title and five fields', () => {
    expect(BUSINESS_CASE_TITLE).toBe('Business case')
    expect([...BUSINESS_CASE_FIELDS]).toEqual([
      'Why it exists',
      'Who pays',
      'Market signal',
      'Proof people pay',
      'Demo goal'
    ])
    expect(BUSINESS_CASE_WHY.startsWith('Organizations buy cover')).toBe(true)
    expect(BUSINESS_CASE_WHO.startsWith('Enterprises and grassroots')).toBe(true)
    expect(BUSINESS_CASE_MARKET).toContain('$115M')
    expect(BUSINESS_CASE_MARKET).toContain('2070')
    expect(BUSINESS_CASE_PROOF_CHAIN.startsWith('Other-chain analog:')).toBe(true)
    expect(BUSINESS_CASE_PROOF_FIAT.startsWith('Non-chain analog:')).toBe(true)
    expect(BUSINESS_CASE_PROOF_CHAIN).toContain('Nexus Mutual')
    expect(BUSINESS_CASE_PROOF_CHAIN).toContain('OnRe')
    expect(BUSINESS_CASE_DEMO.startsWith('In one visit')).toBe(true)
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual(['DefiLlama Nexus Mutual'])
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
    expect(joined.split('\n')[0]).not.toMatch(/wallet/i)
  })
})
