import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AMOUNT_IN_ADVANCED,
  DEFAULT_TITLE,
  EYEBROW,
  FOOTER,
  LEDE,
  LOOKUP_BUTTON,
  PAID_LABEL,
  PRIMARY_COPY,
  REGISTER_BUTTON,
  REGISTER_JOB,
  RIGHTS_LABEL,
  WHAT_LABEL,
  WHO_LABEL,
  notFoundLine,
  sheetTitle
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const html = readFileSync(join(here, '../../index.html'), 'utf8')
const readme = readFileSync(join(here, '../../../README.md'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const styles = readFileSync(join(here, '../../../../pages/styles.css'), 'utf8')
const pagesYml = readFileSync(join(here, '../../../../.github/workflows/pages.yml'), 'utf8')
const rootReadme = readFileSync(join(here, '../../../../README.md'), 'utf8')
const cardStart = catalog.indexOf('href="./trace/"')
const traceCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const face = app.slice(0, app.indexOf('<details'))

describe('first-paint copy', () => {
  it('names the job, not a protocol sentence', () => {
    expect(html).toContain('<title>Trace receipt</title>')
    expect(EYEBROW).toBe('Trace')
    expect(DEFAULT_TITLE).toBe('Register a receipt.')
    expect(LEDE).toBe('Pay a little to register. Look it up.')
    expect(LOOKUP_BUTTON).toBe('Look up')
    expect(REGISTER_BUTTON).toBe('Register')
    expect(sheetTitle(null)).toBe('Register a receipt.')
    expect(sheetTitle('Dawn lot 12')).toBe('Dawn lot 12')
    expect(notFoundLine('dawn')).toBe('No receipt for dawn.')
    expect(FOOTER).toBe('Not a dataset stall. Not a signed record desk.')
    expect(WHAT_LABEL).toBe('What')
    expect(WHO_LABEL).toBe('Who')
    expect(RIGHTS_LABEL).toBe('Rights')
    expect(PAID_LABEL).toBe('Paid')
    expect(app).toContain('{EYEBROW}')
    expect(app).toContain('{LEDE}')
    expect(app).toContain('LOOKUP_BUTTON')
    expect(app).toContain('REGISTER_BUTTON')
    expect(app).toContain('{FOOTER}')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('dataset stall')
    expect(app).not.toContain('signed record')
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Connecting…')
    expect(app).not.toContain('Connect')
    expect(face).not.toContain('Live')
    expect(traceCard).toContain('class="badge">Server<')
    expect(traceCard).toContain('>View<')
    expect(traceCard).toContain('How to run')
    expect(traceCard).toContain(LEDE)
    expect(traceCard).toContain('Pay a little to register. Look it up.')
    expect(traceCard).not.toContain('Live')
    expect(traceCard).not.toContain('Open UI')
    expect(traceCard).not.toContain('sats')
    expect(pagesYml).toContain('trace/frontend/package-lock.json')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/trace/')
    expect(pagesYml).toContain('site/trace')
    expect(rootReadme).toContain('## Trace receipt')
    expect(rootReadme).toContain('./trace/README.md')
  })

  it('keeps identity hex and sats off the face', () => {
    expect(face).not.toContain('identity key')
    expect(face).not.toContain('{identityKey}')
    expect(face).not.toContain('sats')
    expect(app).toContain('<summary>Advanced</summary>')
    expect(app).toContain('formatSats(FEE_SATS)')
    expect(app).toContain('shortKey(receipt.txid')
  })

  it('asks the wallet only on Register', () => {
    expect(app).toContain('const session = await ensureWallet()')
    expect(app).toContain('void runRegister()')
    const lookupFn = app.slice(app.indexOf('const runLookup'), app.indexOf('const runRegister'))
    expect(lookupFn).not.toContain('ensureWallet')
    expect(lookupFn).not.toContain('connect()')
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).toContain('DECLINED_SPEND')
  })

  it('hints Amount in Advanced when dollars are not on the face', () => {
    expect(AMOUNT_IN_ADVANCED).toBe('Amount in Advanced')
    expect(face).toContain('AMOUNT_IN_ADVANCED')
    expect(face).toContain('priceHint')
    expect(face).not.toContain('$—')
    expect(face).toContain('priceFace(FEE_SATS, rate)')
  })

  it('shares ?t= and stays off dump-sale and signed-note copy', () => {
    expect(app).toContain('goToTrace')
    expect(app).toContain('tracePublicUrl')
    expect(app).not.toContain('/trace/')
    expect(readme).toContain('?t=')
    expect(readme).toContain('query params')
    expect(readme).toContain('not** a dataset stall')
    expect(readme).toContain('not** a signed record desk')
    expect(REGISTER_JOB).toBe('What. Who. Rights. Then pay to post.')
    expect(styles).toContain('.demo-trace')
    expect(styles).toMatch(/\.demo-trace[\s\S]*--chip:\s*#9a3412/)
    expect(traceCard).toContain('scenes/trace.webp')
    expect(traceCard).not.toContain('Post a listing')
    expect(traceCard).not.toContain('signed reading')
    expect(traceCard).not.toContain('take the file')
    expect(FOOTER).toBe('Not a dataset stall. Not a signed record desk.')
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/\bLive\b/)
      expect(line).not.toMatch(/\bsats?\b/i)
      if (line !== FOOTER) {
        expect(line).not.toContain('dataset')
        expect(line).not.toContain('signed record')
      }
    }
  })
})
