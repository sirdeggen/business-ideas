import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AUM_LINE,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
  CREATE_BUTTON,
  CREATING_BUTTON,
  EXPORT_BUTTON,
  EYEBROW,
  FEE_FACE,
  ISSUE_BUTTON,
  ISSUING_BUTTON,
  JOB,
  PRODUCT,
  STRANGER_LINE,
  TRANSFER_BUTTON,
  TRANSFERRING_BUTTON
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
const cardStart = catalog.indexOf('href="./registry/"')
const registryCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const streamStart = catalog.indexOf('href="./streampay/"')
const streamCard = catalog.slice(streamStart, catalog.indexOf('</article>', streamStart))
const grantStart = catalog.indexOf('href="./grants/"')
const grantCard = catalog.slice(grantStart, catalog.indexOf('</article>', grantStart))
const face = app.slice(0, app.indexOf('<details'))

describe('first-paint copy', () => {
  it('names Registry Desk and the share-register job', () => {
    expect(html).toContain('<title>Registry Desk</title>')
    expect(PRODUCT).toBe('Registry Desk')
    expect(JOB).toBe('Issue units on a register. Transfer with a receipt. Export the reading.')
    expect(app).toContain('{PRODUCT}')
    expect(app).toContain('{JOB}')
    expect(EYEBROW).toBe('Ledger')
    expect(CREATE_BUTTON).toBe('Create register')
    expect(ISSUE_BUTTON).toBe('Issue units')
    expect(TRANSFER_BUTTON).toBe('Transfer')
    expect(EXPORT_BUTTON).toBe('Export reading')
    expect(CREATING_BUTTON).toBe('Creating…')
    expect(ISSUING_BUTTON).toBe('Issuing…')
    expect(TRANSFERRING_BUTTON).toBe('Transferring…')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('Approve in wallet')
    expect(app).not.toMatch(/Title desk/)
    expect(app).not.toMatch(/Handoff/)
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('connect wallet')
    expect(app).not.toContain('>Live<')
    expect(registryCard).toContain('class="badge">Server<')
    expect(registryCard).toContain('>View<')
    expect(registryCard).not.toContain('Live')
    expect(registryCard).not.toContain('Open UI')
  })

  it('keeps sat amounts under Advanced and exports without a wallet', () => {
    expect(face).toContain('htmlFor="register-name">Register<')
    expect(face).toContain('htmlFor="unit-label">Unit label<')
    expect(face).toContain('{FEE_FACE}')
    expect(face).toContain('{AUM_LINE}')
    expect(face).toContain('{STRANGER_LINE}')
    expect(face).toContain('{EXPORT_BUTTON}')
    expect(face).not.toContain('sats')
    expect(FEE_FACE).toContain('protocol fee')
    expect(AUM_LINE).toContain('does not collect')
    expect(STRANGER_LINE).toContain('No wallet')
    const exportFn = app.slice(app.indexOf('const runExport'))
    expect(exportFn.slice(0, exportFn.indexOf('const runOpen'))).not.toContain('ensureWallet')
  })

  it('uses Creating / Issuing / Transferring on busy primaries', () => {
    expect(app).toContain('busy === \'create\' ? CREATING_BUTTON : CREATE_BUTTON')
    expect(app).toContain('busy === \'issue\' ? ISSUING_BUTTON : ISSUE_BUTTON')
    expect(app).toContain('busy === \'transfer\' ? TRANSFERRING_BUTTON : TRANSFER_BUTTON')
    for (const label of [
      CREATING_BUTTON, ISSUING_BUTTON, TRANSFERRING_BUTTON,
      CREATE_BUTTON, ISSUE_BUTTON, TRANSFER_BUTTON, EXPORT_BUTTON
    ]) {
      expect(label.toLowerCase()).not.toContain('wallet')
      expect(label.toLowerCase()).not.toContain('approve')
    }
  })

  it('asks the wallet only on Create, Issue, and Transfer', () => {
    expect(app.split('const session = await ensureWallet()')).toHaveLength(4)
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('isWalletMissing')
  })

  it('keeps the catalog card Server + View and the prior Live badges', () => {
    expect(registryCard).toContain('Registry Desk')
    expect(registryCard).toContain(JOB)
    expect(registryCard).toContain('registry/README.md')
    expect(registryCard).toContain('scenes/registry.webp')
    expect(registryCard).toContain('class="badge">Server<')
    expect(registryCard).toContain('>View<')
    expect(registryCard).not.toContain('Live')
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(streamCard).toContain('Pay as they work.')
    expect(grantCard).toContain('A gift for a purpose.')
    expect(readme).toContain('# Registry Desk (v0)')
    expect(rootReadme).toContain('## Registry Desk\n')
    expect(html).toContain('<title>Registry Desk</title>')
    expect(readme).toContain('?r=<registerId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/r\/:id/)
  })

  it('adds registry to Pages without dropping earlier desks', () => {
    expect(catalogCss).toContain('.demo-registry')
    expect(css).toContain('--emerald:')
    expect(css).toContain('Fraunces')
    expect(css).not.toContain('#1f3a5f')
    expect(css).not.toContain('#1F3A5F')
    expect(css).not.toContain('#7c3aed')
    expect(css).not.toContain('#22d3ee')
    expect(css).not.toContain('#06b6d4')
    expect(pagesYml).toContain('# credit-desk')
    expect(pagesYml).toContain('# registry-desk')
    expect(pagesYml).toContain('registry/frontend/package-lock.json')
    expect(pagesYml).toContain('credit/frontend/package-lock.json')
    expect(pagesYml).toContain('site/registry')
    expect(pagesYml).toContain('site/credit')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/registry/')
    expect(pagesYml).toContain('site/handoff site/credit site/registry site/scenes')
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'scenes'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
    for (const href of [
      './tickets/', './receivables/', './invoices/', './treasury/', './streampay/',
      './grants/', './records/', './raffle/', './spend-policy/', './session/',
      './datasets/', './memberships/', './names/', './titles/', './trace/',
      './job-escrow/', './vault-claim/', './kya/', './vouch/', './handoff/',
      './credit/', './registry/'
    ]) {
      expect(catalog).toContain(`href="${href}"`)
    }
    const creditStart = catalog.indexOf('href="./credit/"')
    const creditCard = catalog.slice(creditStart, catalog.indexOf('</article>', creditStart))
    expect(creditCard).toContain('Credit Desk')
    expect(creditCard).toContain('class="badge">Server<')
    expect(creditCard).toContain('>View<')
    expect(creditCard).not.toContain('Live')
  })

  it('shows Business case once below the head, above the desk, without a wallet', () => {
    expect(app).toContain('<BusinessCase />')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{JOB}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const desk = app.indexOf('{!registerId && (')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(desk).toBeGreaterThan(caseMark)
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
    expect(BUSINESS_CASE_WHY).toContain('share register')
    expect(BUSINESS_CASE_WHO).toContain('AUM')
    expect(BUSINESS_CASE_MARKET).toContain('193')
    expect(BUSINESS_CASE_PROOF.length).toBe(3)
    expect(BUSINESS_CASE_DEMO).toContain('create → issue → transfer → export')
    const joined = [
      BUSINESS_CASE_WHY,
      BUSINESS_CASE_WHO,
      BUSINESS_CASE_MARKET,
      ...BUSINESS_CASE_PROOF,
      BUSINESS_CASE_DEMO
    ].join('\n')
    expect(joined).not.toMatch(/Revandrew/)
    expect(joined).not.toMatch(/Margaret/)
    expect(joined).not.toMatch(/## Sources/)
  })
})
