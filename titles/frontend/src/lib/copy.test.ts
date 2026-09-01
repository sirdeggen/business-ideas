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
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const pages = readFileSync(join(here, '../../../../.github/workflows/pages.yml'), 'utf8')
const cardStart = catalog.indexOf('href="./titles/"')
const titleCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))

describe('first-paint copy', () => {
  it('names the desk and the job, not a protocol sentence', () => {
    expect(TITLE).toBe('Title desk')
    expect(LIST_HEADING).toBe('Titles')
    expect(LEDE).toBe('Issue a titled document. Transfer the title. Export if you hold it.')
    expect(TRANSFER_BUTTON).toBe('Transfer title')
    expect(EXPORT_BUTTON).toBe('Export')
    expect(ISSUE_BUTTON).toBe('Issue a title')
    expect(ISSUE_JOB).toBe('A label, the document, and a price.')
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
    expect(app).toContain('holderFaceName(names[row.holder])')
    expect(app).not.toContain('{formatSats')
    expect(app).not.toContain('row.holder}')
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
    expect(pages.match(/^  deploy:/gm)).toHaveLength(1)
  })
})
