import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_LIST,
  EXPORT_BUTTON,
  FOOTER,
  ISSUE_BUTTON,
  ISSUE_JOB,
  LEDE,
  LIST_HEADING,
  PRIMARY_COPY,
  TITLE,
  TRANSFER_BUTTON
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const css = readFileSync(join(here, '../index.css'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const pages = readFileSync(join(here, '../../../../.github/workflows/pages.yml'), 'utf8')
const cardStart = catalog.indexOf('href="./titles/"')
const titleCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const jsx = app.slice(app.indexOf('return ('))
const face = jsx.slice(0, jsx.indexOf('<details'))
const issueFn = app.slice(app.indexOf('const runIssue'), app.indexOf('const runTransfer'))
const transferFn = app.slice(app.indexOf('const runTransfer'), app.indexOf('const runExport'))
const exportFn = app.slice(app.indexOf('const runExport'), app.indexOf('const retry'))

describe('first-paint copy', () => {
  it('names the desk and the job, not a protocol sentence', () => {
    expect(TITLE).toBe('Title desk')
    expect(LIST_HEADING).toBe('Titles')
    expect(LEDE).toBe('Issue a titled document. Transfer the title. Export if you hold it.')
    expect(TRANSFER_BUTTON).toBe('Transfer title')
    expect(EXPORT_BUTTON).toBe('Export')
    expect(ISSUE_BUTTON).toBe('Issue a title')
    expect(ISSUE_JOB).toBe('A title, the document, and a price.')
    expect(EMPTY_LIST).toBe('No titles yet.')
    expect(FOOTER).toBe('Not a bank. Not a signed record. Not a dataset stall.')
    expect(app).toContain('{LIST_HEADING}')
    expect(app).toContain('htmlFor="price">Price<')
    expect(app).toContain('TRANSFER_BUTTON')
    expect(app).toContain('EXPORT_BUTTON')
    expect(app).toContain('ISSUE_BUTTON')
    expect(app).not.toContain('Price (sats)')
    expect(app).not.toContain('price in sats')
    expect(app).not.toContain('formatSats')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('CargoX')
  })

  it('is title custody, not a bank or a paid dump', () => {
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/DePIN/i)
      expect(line).not.toMatch(/USDC/i)
      expect(line).not.toMatch(/APY/i)
      expect(line).not.toMatch(/\$0\.00/)
      expect(line).not.toMatch(/\bLive\b/)
      expect(line).not.toMatch(/\bsats?\b/i)
      expect(line).not.toMatch(/CargoX/i)
    }
    expect(FOOTER).toMatch(/Not a bank/)
    expect(FOOTER).toMatch(/Not a signed record/)
    expect(FOOTER).toMatch(/Not a dataset stall/)
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Connecting…')
    expect(app).not.toContain('identity key')
    expect(app).not.toContain('{identityKey}')
    expect(app).not.toContain('{row.holder}')
    expect(app).not.toMatch(/\$0\.00/)
    expect(app).not.toMatch(/CargoX/)
  })

  it('keeps document hash under Advanced, holder as a name on the face', () => {
    expect(app).toContain('<summary>Advanced</summary>')
    expect(app).toContain('Document hash')
    expect(app).toContain('heldLine(names[row.holder])')
    expect(face).not.toContain('shortKey')
    expect(face).not.toContain('sats')
    expect(face).not.toContain('Price (sats)')
    expect(face).not.toContain('{formatSats')
    expect(face).not.toContain('row.holder}')
    expect(face).not.toContain('identity key')
    expect(face).not.toContain('02…')
    expect(face).not.toContain('Name or account')
    expect(face).not.toContain('Amounts are in sats.')
    expect(app).toContain('Amounts are in sats.')
  })

  it('paints paper-and-navy with hairlines', () => {
    expect(css).toContain('--paper: #F7F5F2')
    expect(css).toContain('--ink: #1F3A5F')
    expect(css).toContain('--hair:')
    expect(css).toContain('border: 1px solid var(--hair)')
  })

  it('shows the title list before wallet chrome', () => {
    const list = app.indexOf('{LIST_HEADING}')
    const issue = app.indexOf('{ISSUE_HEADING}')
    const install = app.indexOf('{showInstall &&')
    expect(list).toBeGreaterThan(-1)
    expect(issue).toBeGreaterThan(list)
    expect(install).toBeGreaterThan(issue)
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).toContain('isWalletMissing')
    expect(app).toContain('Install BSV Desktop')
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Connecting…')
  })

  it('asks the wallet only on Issue / Transfer / Export, after the form is ready', () => {
    expect(issueFn.indexOf('assertCanIssue')).toBeLessThan(issueFn.indexOf('ensureWallet'))
    expect(transferFn.indexOf('if (transferOpen !== row.titleId)')).toBeLessThan(transferFn.indexOf('ensureWallet'))
    expect(transferFn.indexOf('.trim()')).toBeLessThan(transferFn.indexOf('ensureWallet'))
    expect(exportFn.indexOf('ensureWallet')).toBeGreaterThan(-1)
    expect(app).toContain('const session = await ensureWallet()')
    expect(app).toContain('const canActOn')
    expect(app).toContain('{canActOn(row) &&')
    expect(transferFn).toContain('if (identityKey && !isHolder(row, identityKey)) return')
    expect(exportFn).toContain('if (identityKey && !isHolder(row, identityKey)) return')
    expect(exportFn).not.toContain('setActionError(NOT_HOLDER)')
    expect(transferFn).not.toContain('setActionError(NOT_HOLDER)')
  })

  it('keeps the catalog card Server + View, not Open UI or Live', () => {
    expect(titleCard).toContain('class="badge">Server<')
    expect(titleCard).toContain('>View<')
    expect(titleCard).toContain('How to run')
    expect(titleCard).toContain('Issue a titled document. Transfer the title. Export if you hold it.')
    expect(titleCard).not.toContain('Open UI')
    expect(titleCard).not.toContain('soon')
    expect(titleCard).not.toContain('Live')
    expect(titleCard).not.toContain('sats')
    expect(titleCard).not.toContain('CargoX')
  })

  it('adds titles to Pages without a sibling deploy job', () => {
    expect(pages).toContain('titles/frontend/package-lock.json')
    expect(pages).toContain('working-directory: titles/frontend')
    expect(pages).toContain('VITE_BASE: /business-ideas/titles/')
    expect(pages).toContain('VITE_OVERLAY_URL: https://overlay-us-1.bsvb.tech')
    expect(pages).toContain('mkdir -p site/tickets')
    expect(pages).toContain('site/titles')
    expect(pages).toContain('cp -r titles/frontend/dist/. site/titles/')
    expect(pages).toContain('site/records')
    expect(pages).toContain('site/datasets')
    expect(pages).toContain('site/raffle')
    expect(pages).toContain('site/memberships')
    expect(pages).toContain('site/names')
    expect(pages).toContain('memberships/frontend/package-lock.json')
    expect(pages).toContain('names/frontend/package-lock.json')
    expect(pages).toContain('working-directory: memberships/frontend')
    expect(pages).toContain('working-directory: names/frontend')
    expect(pages).toContain('cp -r memberships/frontend/dist/. site/memberships/')
    expect(pages).toContain('cp -r names/frontend/dist/. site/names/')
    expect(pages.match(/^  deploy:/gm)).toHaveLength(1)
  })

  it('keeps memberships and names catalog cards next to titles', () => {
    expect(catalog).toContain('href="./memberships/"')
    expect(catalog).toContain('href="./names/"')
    expect(catalog).toContain('href="./titles/"')
    expect(catalog).toContain('<h2>Membership</h2>')
    expect(catalog).toContain('<h2>Name lease</h2>')
    expect(catalog).toContain('<h2>Title desk</h2>')
  })
})
