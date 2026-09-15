import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sheetTitle } from '../../../protocol/kya'
import {
  EYEBROW,
  FEE_LINE,
  ISSUE_BUTTON,
  ISSUE_JOB,
  ISSUING_BUTTON,
  JOB,
  PRODUCT,
  REGISTER_BUTTON,
  REGISTER_JOB,
  REGISTERING_BUTTON,
  VERIFY_BUTTON,
  VERIFY_JOB,
  VERIFYING_BUTTON
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
const cardStart = catalog.indexOf('href="./kya/"')
const kyaCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const streamStart = catalog.indexOf('href="./streampay/"')
const streamCard = catalog.slice(streamStart, catalog.indexOf('</article>', streamStart))
const grantStart = catalog.indexOf('href="./grants/"')
const grantCard = catalog.slice(grantStart, catalog.indexOf('</article>', grantStart))
const face = app.slice(0, app.indexOf('<details'))
const advanced = app.slice(app.indexOf('<details'))

describe('first-paint copy', () => {
  it('names Register / Issue / Verify and the job line', () => {
    expect(html).toContain('<title>Know Your Agent</title>')
    expect(JOB).toBe('Verify who’s behind an agent before it acts.')
    expect(app).toContain('{JOB}')
    expect(app).toContain('{title}')
    expect(sheetTitle(null)).toBe('Register')
    expect(sheetTitle('registered')).toBe('Issue')
    expect(sheetTitle('issued')).toBe('Verify')
    expect(sheetTitle('verified')).toBe('Verified')
    expect(PRODUCT).toBe('Know Your Agent')
    expect(REGISTER_BUTTON).toBe('Register')
    expect(ISSUE_BUTTON).toBe('Issue')
    expect(VERIFY_BUTTON).toBe('Verify')
    expect(REGISTERING_BUTTON).toBe('Registering…')
    expect(ISSUING_BUTTON).toBe('Issuing…')
    expect(VERIFYING_BUTTON).toBe('Verifying…')
    expect(REGISTER_JOB).toBe('Name the agent and who stands behind it.')
    expect(ISSUE_JOB).toBe('Issue the signed credential for this agent.')
    expect(VERIFY_JOB).toBe('Pay a little to verify who stands behind this agent.')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toMatch(/StreamPay/)
    expect(app).not.toMatch(/Session AP/)
    expect(app).not.toMatch(/Spend Policy/)
    expect(app).not.toMatch(/Job escrow/)
    expect(app).not.toMatch(/Vault Claim/)
  })

  it('keeps one title: quieter Proof eyebrow, h1 Register / Issue / Verify', () => {
    expect(EYEBROW).toBe('Proof')
    expect(app).toContain('className="eyebrow">{EYEBROW}<')
    expect(app).toContain('<h1>{title}</h1>')
    expect(app).toContain('sheetTitle')
    expect(app).not.toContain('Connect hero')
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect')
    expect(app).not.toContain('connect wallet')
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Live')
    expect(app).not.toContain('Open UI')
    expect(kyaCard).toContain('class="badge">Server<')
    expect(kyaCard).toContain('>View<')
    expect(kyaCard).not.toContain('Live')
    expect(kyaCard).not.toContain('Open UI')
  })

  it('keeps sats and hex off the face; protocol fee under Advanced', () => {
    expect(face).toContain('htmlFor="agent">Agent<')
    expect(face).toContain('htmlFor="owner">Owner<')
    expect(face).not.toContain('sats')
    expect(face).not.toContain('Identity key')
    expect(face).not.toContain('02…')
    expect(face).not.toContain('03…')
    expect(face).not.toMatch(/\$\d/)
    expect(advanced).toContain('Amounts are in sats.')
    expect(advanced).toContain('htmlFor="verify-sats">Verify fee<')
    expect(advanced).toContain('Advanced')
    expect(advanced).toContain('{FEE_LINE}')
    expect(FEE_LINE).toContain('protocol fee')
    expect(FEE_LINE).toContain('labeled separately')
  })

  it('uses Registering / Issuing / Verifying on busy primaries, never wallet on those labels', () => {
    expect(app).toContain('busy === \'register\' ? REGISTERING_BUTTON : REGISTER_BUTTON')
    expect(app).toContain('busy === \'issue\' ? ISSUING_BUTTON : ISSUE_BUTTON')
    expect(app).toContain('busy === \'verify\' ? VERIFYING_BUTTON : VERIFY_BUTTON')
    for (const label of [
      REGISTERING_BUTTON, ISSUING_BUTTON, VERIFYING_BUTTON,
      REGISTER_BUTTON, ISSUE_BUTTON, VERIFY_BUTTON
    ]) {
      expect(label.toLowerCase()).not.toContain('wallet')
    }
    expect(face).not.toContain('Approve in your wallet')
    expect(face).not.toContain('Waiting for wallet')
    expect(face).not.toContain('Approve in wallet')
  })

  it('asks the wallet only on Register, Issue, and Verify', () => {
    expect(app).toContain('const session = await ensureWallet()')
    expect(app.split('const session = await ensureWallet()')).toHaveLength(4)
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).toContain('isWalletMissing')
  })

  it('keeps the catalog card Server + View, not Open UI or Live', () => {
    expect(kyaCard).toContain('<h2>')
    expect(kyaCard).toContain('Know Your Agent')
    expect(kyaCard).toContain('Verify who’s behind an agent before it acts.')
    expect(kyaCard).toContain('kya/README.md')
    expect(kyaCard).toContain('class="badge">Server<')
    expect(kyaCard).toContain('>View<')
    expect(kyaCard).toContain('scenes/kya.webp')
    expect(kyaCard).not.toContain('sats')
    expect(kyaCard).not.toContain('soon')
    expect(kyaCard).not.toContain('Live')
    expect(kyaCard).not.toContain('Open UI')
    expect(readme).toContain('# KYA desk (v0)')
    expect(rootReadme).toContain('## KYA\n')
    expect(html).toContain('<title>Know Your Agent</title>')
    expect(readme).toContain('?a=<agentId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/a\/:id/)
    expect(app).not.toContain('pathname.match')
  })

  it('leaves StreamPay and Grant receipt Live', () => {
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(streamCard).toContain('Pay as they work.')
    expect(grantCard).toContain('A gift for a purpose.')
  })

  it('is a violet verification lounge, not a paper-navy, yellow, or brass clone', () => {
    expect(css).toContain('--iris:')
    expect(css).toContain('--cyan:')
    expect(css).toContain('Syne')
    expect(css).not.toContain('#1f3a5f')
    expect(css).not.toContain('#1F3A5F')
    expect(css).not.toContain('#e85d04')
    expect(css).not.toContain('#A67C3D')
    expect(css).not.toContain('#E4D6C3')
    expect(catalogCss).toContain('.demo-kya')
    expect(pagesYml).toContain('kya/frontend/package-lock.json')
    expect(pagesYml).toContain('site/kya')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/kya/')
    expect(pagesYml).toContain('vault-claim/frontend/package-lock.json')
    expect(pagesYml).toContain('site/vault-claim')
    expect(pagesYml).toContain('invoices/frontend/spa-404.html')
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'scenes'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
  })
})
