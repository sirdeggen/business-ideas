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
    expect(titleCard).not.toContain('Business case')
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
    expect(catalog).toContain('>Membership</h2>')
    expect(catalog).toContain('>Name lease</h2>')
    expect(catalog).toContain('>Title desk</h2>')
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
  })

  it('keeps the locked bodies and does not dump Margaret, Status, or Sources', () => {
    expect(BUSINESS_CASE_WHY).toBe(
      'A titled document is an object someone holds — issue it, transfer who holds the title, export only if you hold it. The pain is “who owns this paper now?” without a fax chain or a PDF anyone can copy.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Issuers (carriers, freight forwarders, document desks, clubs) pay to issue the titled document. Holders or receiving parties pay the transfer / custody fee when title moves. Enterprise document desks and grassroots clubs both open a wallet on that path.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'CargoX platform announcements: more than 10M electronic trade documents transferred by mid-2025, later citing 12M. Exact platform fee take-rate and eBL-only revenue are unknown in public filings.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain / digital-title analog: CargoX Blockchain Document Transfer — carriers and traders already move electronic bills of lading and related titles as transferable documents.'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: Title insurance workflows, certificate registries, diploma verification portals — budgets already exist for “who holds the title now?”'
    )
    expect(BUSINESS_CASE_DEMO).toBe(
      'Issue a titled document → transfer the title (transfer/custody fee visible) → export only if holder, on a public desk.'
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
  })

  it('offers at most three citation chips', () => {
    expect(BUSINESS_CASE_CITATIONS.length).toBeLessThanOrEqual(3)
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual([
      'CargoX 10M',
      'CargoX 12M'
    ])
  })

  it('sits once below the head and above the desk, on the default view only', () => {
    expect(app).toContain('<BusinessCase />')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const desk = app.indexOf('<section className="slip">')
    const install = app.indexOf('{showInstall &&')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(desk).toBeGreaterThan(caseMark)
    expect(install).toBeGreaterThan(desk)

    expect(titleCard).toContain('class="badge">Server<')
    expect(titleCard).toContain('>View<')
    expect(titleCard).not.toContain('Live')
    expect(titleCard).not.toContain('Business case')
  })
})
