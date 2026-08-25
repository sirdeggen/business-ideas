import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BUY_BUTTON,
  EMPTY_LIST,
  FOOTER,
  LEDE,
  POST_BUTTON,
  POST_JOB,
  PRIMARY_COPY,
  STALL_HEADING,
  TITLE
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const cardStart = catalog.indexOf('href="./datasets/"')
const datasetCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))

describe('first-paint copy', () => {
  it('names the stall and the job, not a protocol sentence', () => {
    expect(TITLE).toBe('Dataset stall')
    expect(STALL_HEADING).toBe('The stall')
    expect(LEDE).toBe('Post a listing. Pay a little to take the file.')
    expect(BUY_BUTTON).toBe('Get the file.')
    expect(POST_BUTTON).toBe('Post a listing')
    expect(POST_JOB).toBe('Title, license, the file, and a price.')
    expect(EMPTY_LIST).toBe('No listings yet.')
    expect(FOOTER).toBe('Not a radio network. Not a crawler paywall.')
    expect(app).toContain('{STALL_HEADING}')
    expect(app).toContain('License')
    expect(app).toContain('htmlFor="price">Price<')
    expect(app).toContain('BUY_BUTTON')
    expect(app).toContain('POST_BUTTON')
    expect(app).not.toContain('Price (sats)')
    expect(app).not.toContain('price in sats')
    expect(app).not.toContain('sample hash, sats')
    expect(app).not.toContain('Paid 100')
    expect(app).not.toContain('formatSats')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
  })

  it('is a catalog for labs, not Grass radios or a crawler paywall', () => {
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/DePIN/i)
      expect(line).not.toMatch(/USDC/i)
      expect(line).not.toMatch(/APY/i)
      expect(line).not.toMatch(/\$0\.00/)
      expect(line).not.toMatch(/\bLive\b/)
      expect(line).not.toMatch(/\bsats?\b/i)
    }
    expect(FOOTER).toMatch(/Not a radio network/)
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Connecting…')
    expect(app).not.toContain('identity key')
    expect(app).not.toContain('{identityKey}')
    expect(app).not.toMatch(/DePIN/)
    expect(app).not.toMatch(/USDC/)
    expect(app).not.toMatch(/APY/)
    expect(app).not.toMatch(/\$0\.00/)
    expect(app).not.toMatch(/node operator/i)
    expect(app).not.toMatch(/\bradios?\b/i)
  })

  it('keeps sample hash under Advanced, not on the listing face', () => {
    expect(app).toContain('<summary>Advanced</summary>')
    expect(app).toContain('Sample hash')
    expect(app.indexOf('<h3>{row.title}</h3>')).toBeLessThan(app.indexOf('{row.license}'))
    expect(app).toContain('BUY_BUTTON')
    expect(app).not.toContain('{formatSats(row.priceSats)}')
    expect(app).not.toContain('{formatSats(receipt.paidSats)}')
  })

  it('shows the stall list before wallet chrome', () => {
    const stall = app.indexOf('{STALL_HEADING}')
    const post = app.indexOf('{POST_HEADING}')
    const install = app.indexOf('{showInstall &&')
    expect(stall).toBeGreaterThan(-1)
    expect(post).toBeGreaterThan(stall)
    expect(install).toBeGreaterThan(post)
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).not.toContain('Boolean(combinedError) && !overlayDown')
    expect(app).toContain('isWalletMissing')
    expect(app).toContain('Install BSV Desktop')
  })

  it('keeps the catalog card Server + View, not Open UI or Live', () => {
    expect(datasetCard).toContain('class="badge">Server<')
    expect(datasetCard).toContain('>View<')
    expect(datasetCard).toContain('How to run')
    expect(datasetCard).toContain('Post a listing. Pay a little to take the file.')
    expect(datasetCard).not.toContain('sample hash')
    expect(datasetCard).not.toContain('sats')
    expect(datasetCard).not.toContain('Open UI')
    expect(datasetCard).not.toContain('soon')
    expect(datasetCard).not.toContain('Live')
    expect(datasetCard).not.toContain('radio')
  })
})
