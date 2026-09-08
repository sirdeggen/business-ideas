import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { sheetTitle } from '../../../protocol/jobescrow'
import {
  CHALLENGE_BUTTON,
  CHALLENGING_BUTTON,
  EYEBROW,
  FEE_STORY,
  FUND_BUTTON,
  FUND_JOB,
  FUNDING_BUTTON,
  JOB,
  PRODUCT,
  REFUND_BUTTON,
  REFUNDING_BUTTON,
  RELEASE_BUTTON,
  RELEASING_BUTTON,
  SUBMIT_BUTTON,
  SUBMIT_JOB,
  SUBMITTING_BUTTON
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
const cardStart = catalog.indexOf('href="./job-escrow/"')
const jobCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const streamStart = catalog.indexOf('href="./streampay/"')
const streamCard = catalog.slice(streamStart, catalog.indexOf('</article>', streamStart))
const grantStart = catalog.indexOf('href="./grants/"')
const grantCard = catalog.slice(grantStart, catalog.indexOf('</article>', grantStart))
const face = app.slice(0, app.indexOf('<details'))
const advanced = app.slice(app.indexOf('<details'))

describe('first-paint copy', () => {
  it('names Job / Submit / Release / Refund and the job line', () => {
    expect(html).toContain('<title>Job escrow</title>')
    expect(JOB).toBe('Fund a job. Lock until the hash lands.')
    expect(app).toContain('{JOB}')
    expect(app).toContain('{title}')
    expect(sheetTitle(null)).toBe('Job')
    expect(sheetTitle('funded')).toBe('Submit')
    expect(sheetTitle('submitted')).toBe('Release')
    expect(sheetTitle('challenged')).toBe('Refund')
    expect(PRODUCT).toBe('Job escrow')
    expect(FUND_BUTTON).toBe('Fund')
    expect(SUBMIT_BUTTON).toBe('Submit')
    expect(RELEASE_BUTTON).toBe('Release')
    expect(CHALLENGE_BUTTON).toBe('Challenge')
    expect(REFUND_BUTTON).toBe('Refund')
    expect(FUNDING_BUTTON).toBe('Funding…')
    expect(SUBMITTING_BUTTON).toBe('Submitting…')
    expect(RELEASING_BUTTON).toBe('Releasing…')
    expect(CHALLENGING_BUTTON).toBe('Challenging…')
    expect(REFUNDING_BUTTON).toBe('Refunding…')
    expect(FUND_JOB).toBe('Label, provider, and amount. A stranger can read the ticket with no wallet.')
    expect(SUBMIT_JOB).toBe('Paste the deliverable hash.')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('GMV')
    expect(app).not.toMatch(/StreamPay/)
    expect(app).not.toMatch(/Session AP/)
    expect(app).not.toMatch(/TermiX/)
  })

  it('keeps one title: quieter Shop eyebrow, h1 Job / Submit / Release', () => {
    expect(EYEBROW).toBe('Shop')
    expect(app).toContain('className="eyebrow">{EYEBROW}<')
    expect(app).toContain('<h1>{title}</h1>')
    expect(app).toContain('sheetTitle')
    expect(app).not.toContain('className="eyebrow">Job escrow<')
    expect(app).not.toContain('Connect hero')
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect')
    expect(app).not.toContain('connect wallet')
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Live')
    expect(app).not.toContain('Open UI')
    expect(jobCard).toContain('class="badge">Server<')
    expect(jobCard).toContain('>View<')
    expect(jobCard).not.toContain('Live')
    expect(jobCard).not.toContain('Open UI')
  })

  it('keeps sats and hex off the face; provider key under Advanced', () => {
    expect(face).toContain('htmlFor="label">Label<')
    expect(face).toContain('htmlFor="provider">Provider<')
    expect(face).toContain('htmlFor="amount">Amount<')
    expect(face).not.toContain('sats')
    expect(face).not.toContain('Amount (sats)')
    expect(face).not.toContain('Identity key')
    expect(face).not.toContain('htmlFor="provider-key"')
    expect(face).not.toContain('02…')
    expect(face).not.toContain('03…')
    expect(face).not.toMatch(/\$\d/)
    expect(advanced).toContain('Amounts are in sats.')
    expect(advanced).toContain('htmlFor="provider-key">Provider key<')
    expect(advanced).toContain('Advanced')
    expect(advanced).toContain('shortKey(identityKey')
    expect(advanced).toContain('{FEE_STORY}')
    expect(FEE_STORY).toContain('2%')
    expect(FEE_STORY).not.toContain('GMV')
  })

  it('uses Funding / Submitting / Releasing on busy primaries, never wallet on those labels', () => {
    expect(app).toContain('busy === \'fund\' ? FUNDING_BUTTON : FUND_BUTTON')
    expect(app).toContain('busy === \'submit\' ? SUBMITTING_BUTTON : SUBMIT_BUTTON')
    expect(app).toContain('busy === \'release\' ? RELEASING_BUTTON : RELEASE_BUTTON')
    expect(app).toContain('busy === \'challenge\' ? CHALLENGING_BUTTON : CHALLENGE_BUTTON')
    expect(app).toContain('busy === \'refund\' ? REFUNDING_BUTTON : REFUND_BUTTON')
    for (const label of [
      FUNDING_BUTTON, SUBMITTING_BUTTON, RELEASING_BUTTON, CHALLENGING_BUTTON, REFUNDING_BUTTON,
      FUND_BUTTON, SUBMIT_BUTTON, RELEASE_BUTTON, CHALLENGE_BUTTON, REFUND_BUTTON
    ]) {
      expect(label.toLowerCase()).not.toContain('wallet')
    }
    expect(face).not.toContain('Approve in your wallet')
    expect(face).not.toContain('Waiting for wallet')
    expect(face).not.toContain('Approve in wallet')
  })

  it('asks the wallet only on Fund, Submit, Release, Challenge, and Refund', () => {
    expect(app).toContain('const session = await ensureWallet()')
    expect(app.split('const session = await ensureWallet()')).toHaveLength(6)
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).toContain('isWalletMissing')
    expect(app).not.toContain('Redeem')
    expect(app).not.toContain('spend-to-redeem')
  })

  it('keeps the catalog card Server + View, not Open UI or Live', () => {
    expect(jobCard).toContain('<h2>')
    expect(jobCard).toContain('Job escrow')
    expect(jobCard).toContain('Fund a job. Lock until the hash lands.')
    expect(jobCard).toContain('job-escrow/README.md')
    expect(jobCard).toContain('class="badge">Server<')
    expect(jobCard).toContain('>View<')
    expect(jobCard).toContain('scenes/job-escrow.webp')
    expect(jobCard).not.toContain('sats')
    expect(jobCard).not.toContain('soon')
    expect(jobCard).not.toContain('Live')
    expect(jobCard).not.toContain('Open UI')
    expect(jobCard).not.toContain('GMV')
    expect(readme).toContain('# Job escrow (v0)')
    expect(rootReadme).toContain('## Job escrow\n')
    expect(html).toContain('<title>Job escrow</title>')
    expect(readme).toContain('?j=<jobId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/j\/:id/)
    expect(app).not.toContain('pathname.match')
  })

  it('leaves StreamPay and Grant receipt Live', () => {
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(streamCard).toContain('Pay as they work.')
    expect(grantCard).toContain('A gift for a purpose.')
  })

  it('is a work-order ticket, not a paper-and-navy clone', () => {
    expect(css).toContain('--ticket:')
    expect(css).toContain('--safety:')
    expect(css).toContain('Barlow Condensed')
    expect(css).not.toContain('#1f3a5f')
    expect(css).not.toContain('#1F3A5F')
    expect(catalogCss).toContain('.demo-job-escrow')
    expect(pagesYml).toContain('job-escrow/frontend/package-lock.json')
    expect(pagesYml).toContain('site/job-escrow')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/job-escrow/')
    expect(pagesYml).toContain('trace/frontend/package-lock.json')
    expect(pagesYml).toContain('site/trace')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/trace/')
    expect(catalog).toContain('href="./trace/"')
    expect(catalog).toContain('scenes/trace.webp')
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'scenes'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
  })
})
