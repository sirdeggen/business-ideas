import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TITLE,
  EYEBROW,
  FOOTER,
  LEDE,
  LOOKUP_BUTTON,
  PRIMARY_COPY,
  REGISTER_BUTTON,
  RENEW_BUTTON,
  leasedLine,
  notFoundLine,
  sheetTitle
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const html = readFileSync(join(here, '../../index.html'), 'utf8')
const readme = readFileSync(join(here, '../../../README.md'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const cardStart = catalog.indexOf('href="./names/"')
const namesCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const face = app.slice(0, app.indexOf('<details'))

describe('first-paint copy', () => {
  it('names the job, not a protocol sentence', () => {
    expect(html).toContain('<title>Name lease</title>')
    expect(EYEBROW).toBe('Names')
    expect(DEFAULT_TITLE).toBe('Lease a name.')
    expect(LEDE).toBe('A name for a while. Look it up. Renew before it ends.')
    expect(LOOKUP_BUTTON).toBe('Look up')
    expect(REGISTER_BUTTON).toBe('Register')
    expect(RENEW_BUTTON).toBe('Renew')
    expect(sheetTitle(null)).toBe('Lease a name.')
    expect(sheetTitle('alice')).toBe('alice')
    expect(notFoundLine('alice')).toBe('alice is free.')
    expect(leasedLine('alice')).toBe('alice is leased.')
    expect(FOOTER).toBe('Not a contacts list. Not invoices.')
    expect(app).toContain('{EYEBROW}')
    expect(app).toContain('{LEDE}')
    expect(app).toContain('LOOKUP_BUTTON')
    expect(app).toContain('REGISTER_BUTTON')
    expect(app).toContain('RENEW_BUTTON')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('ENS')
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Connecting…')
    expect(app).not.toContain('Connect')
    expect(face).not.toContain('Live')
    expect(namesCard).toContain('class="badge">Server<')
    expect(namesCard).toContain('>View<')
    expect(namesCard).toContain('How to run')
    expect(namesCard).toContain('Lease a name for a while. Look it up. Renew before it ends.')
    expect(namesCard).not.toContain('Live')
    expect(namesCard).not.toContain('Open UI')
    expect(namesCard).not.toContain('sats')
  })

  it('keeps identity hex and sats off the face', () => {
    expect(face).not.toContain('identity key')
    expect(face).not.toContain('{identityKey}')
    expect(face).not.toContain('sats')
    expect(face).not.toContain('3,053,862')
    expect(app).toContain('<summary>Advanced</summary>')
    expect(app).toContain('formatSats(amountSats)')
    expect(app).toContain('shortKey(lease.lessee)')
    expect(app).toContain('shortKey(lease.txid')
  })

  it('asks the wallet only on Register and Renew', () => {
    expect(app).toContain('const session = await ensureWallet()')
    expect(app).toContain('void runLease(\'register\')')
    expect(app).toContain('void runLease(\'renew\')')
    const lookupFn = app.slice(app.indexOf('const runLookup'), app.indexOf('const runLease'))
    expect(lookupFn).not.toContain('ensureWallet')
    expect(lookupFn).not.toContain('connect()')
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).toContain('DECLINED_SPEND')
  })

  it('shares ?name= and stays off ENS pricing copy', () => {
    expect(app).toContain('goToName')
    expect(app).toContain('namePublicUrl')
    expect(app).not.toContain('/name/')
    expect(readme).toContain('?name=alice')
    expect(readme).toContain('query params')
    expect(app).not.toContain('/names/')
    expect(readme).toContain('satsPerDay')
    expect(readme).toContain('$3,053,862')
    expect(readme).toContain('cited')
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/\bLive\b/)
      expect(line).not.toMatch(/\bsats?\b/i)
      expect(line).not.toContain('ENS')
    }
  })
})
