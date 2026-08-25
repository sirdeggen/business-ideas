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
  it('names the stall and the catalog fields, not overlay jargon', () => {
    expect(TITLE).toBe('Dataset stall')
    expect(STALL_HEADING).toBe('The stall')
    expect(LEDE).toBe('Labs buy a listed dump (title, license, sample hash, sats).')
    expect(BUY_BUTTON).toBe('Buy this dump')
    expect(POST_BUTTON).toBe('Post a listing')
    expect(EMPTY_LIST).toBe('No listings yet.')
    expect(FOOTER).toBe('Not a radio network. Not a crawler paywall.')
    expect(app).toContain('{STALL_HEADING}')
    expect(app).toContain('License')
    expect(app).toContain('Sample hash')
    expect(app).toContain('Price (sats)')
    expect(app).toContain('BUY_BUTTON')
    expect(app).toContain('POST_BUTTON')
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
    expect(datasetCard).toContain('Labs buy a listed dump')
    expect(datasetCard).not.toContain('Open UI')
    expect(datasetCard).not.toContain('soon')
    expect(datasetCard).not.toContain('Live')
    expect(datasetCard).not.toContain('radio')
  })
})
