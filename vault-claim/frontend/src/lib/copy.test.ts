import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_LIST,
  FOOTER,
  LEDE,
  LIST_HEADING,
  MINT_BUTTON,
  MINT_JOB,
  PRIMARY_COPY,
  REDEEM_BUTTON,
  TITLE,
  TRANSFER_BUTTON
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const css = readFileSync(join(here, '../index.css'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const pages = readFileSync(join(here, '../../../../.github/workflows/pages.yml'), 'utf8')
const cardStart = catalog.indexOf('href="./vault-claim/"')
const vaultCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const jsx = app.slice(app.indexOf('return ('))
const face = jsx.slice(0, jsx.indexOf('<details'))
const mintFn = app.slice(app.indexOf('const runMint'), app.indexOf('const runTransfer'))
const transferFn = app.slice(app.indexOf('const runTransfer'), app.indexOf('const runRedeem'))
const redeemFn = app.slice(app.indexOf('const runRedeem'), app.indexOf('const retry'))

describe('first-paint copy', () => {
  it('names the desk and the job, not a protocol sentence', () => {
    expect(TITLE).toBe('Vault Claim')
    expect(LIST_HEADING).toBe('Claims')
    expect(LEDE).toBe('Claim a vaulted item. Transfer the claim. Burn it to redeem.')
    expect(TRANSFER_BUTTON).toBe('Transfer')
    expect(REDEEM_BUTTON).toBe('Redeem')
    expect(MINT_BUTTON).toBe('Mint a claim')
    expect(MINT_JOB).toBe('A label, the item, and a price.')
    expect(EMPTY_LIST).toBe('No claims yet.')
    expect(FOOTER).toBe('Not a titled document. Not a ticket. Not a pack.')
    expect(app).toContain('{LIST_HEADING}')
    expect(app).toContain('htmlFor="price">Price<')
    expect(app).toContain('TRANSFER_BUTTON')
    expect(app).toContain('REDEEM_BUTTON')
    expect(app).toContain('MINT_BUTTON')
    expect(app).not.toContain('Price (sats)')
    expect(app).not.toContain('price in sats')
    expect(app).not.toContain('formatSats')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('gacha')
    expect(app).not.toContain('Courtyard')
  })

  it('is a vault claim, not a title, ticket, or pack', () => {
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/gacha/i)
      expect(line).not.toMatch(/mystery pack/i)
      expect(line).not.toMatch(/randomized/i)
      expect(line).not.toMatch(/DePIN/i)
      expect(line).not.toMatch(/USDC/i)
      expect(line).not.toMatch(/APY/i)
      expect(line).not.toMatch(/\$0\.00/)
      expect(line).not.toMatch(/\bLive\b/)
      expect(line).not.toMatch(/\bsats?\b/i)
    }
    expect(FOOTER).toMatch(/Not a titled document/)
    expect(FOOTER).toMatch(/Not a ticket/)
    expect(FOOTER).toMatch(/Not a pack/)
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Connecting…')
    expect(app).not.toContain('identity key')
    expect(app).not.toContain('{identityKey}')
    expect(app).not.toContain('{row.holder}')
    expect(app).not.toMatch(/\$0\.00/)
    expect(app).not.toMatch(/gacha/i)
  })

  it('keeps item hash under Advanced, holder as a name on the face', () => {
    expect(app).toContain('<summary>Advanced</summary>')
    expect(app).toContain('Item hash')
    expect(app).toContain('heldLine(names[row.holder])')
    expect(app).toContain('row.itemSerial')
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

  it('paints stone-and-brass, not paper-and-navy invoices', () => {
    expect(css).toContain('--paper: #E4D6C3')
    expect(css).toContain('--ink: #2C2118')
    expect(css).toContain('--brass:')
    expect(css).toContain('--hair:')
    expect(css).not.toContain('--paper: #F7F5F2')
    expect(css).not.toContain('--ink: #1F3A5F')
  })

  it('shows the claim list before wallet chrome', () => {
    const list = app.indexOf('{LIST_HEADING}')
    const mint = app.indexOf('{MINT_HEADING}')
    const install = app.indexOf('{showInstall &&')
    expect(list).toBeGreaterThan(-1)
    expect(mint).toBeGreaterThan(list)
    expect(install).toBeGreaterThan(mint)
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).toContain('isWalletMissing')
    expect(app).toContain('Install BSV Desktop')
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Connecting…')
  })

  it('asks the wallet only on Mint / Transfer / Redeem, after the form is ready', () => {
    expect(mintFn.indexOf('assertCanMint')).toBeLessThan(mintFn.indexOf('ensureWallet'))
    expect(transferFn.indexOf('if (transferOpen !== row.claimId)')).toBeLessThan(transferFn.indexOf('ensureWallet'))
    expect(transferFn.indexOf('.trim()')).toBeLessThan(transferFn.indexOf('ensureWallet'))
    expect(redeemFn.indexOf('ensureWallet')).toBeGreaterThan(-1)
    expect(app).toContain('const session = await ensureWallet()')
    expect(app).toContain('const canActOn')
    expect(app).toContain('{canActOn(row) &&')
    expect(transferFn).toContain('if (identityKey && !isHolder(row, identityKey)) return')
    expect(redeemFn).toContain('if (identityKey && !isHolder(row, identityKey)) return')
    expect(redeemFn).not.toContain('setActionError(NOT_HOLDER)')
    expect(transferFn).not.toContain('setActionError(NOT_HOLDER)')
  })

  it('keeps the catalog card Server + View, not Open UI or Live', () => {
    expect(vaultCard).toContain('class="badge">Server<')
    expect(vaultCard).toContain('>View<')
    expect(vaultCard).toContain('How to run')
    expect(vaultCard).toContain('Claim a vaulted item. Transfer the claim. Burn it to redeem.')
    expect(vaultCard).not.toContain('Open UI')
    expect(vaultCard).not.toContain('soon')
    expect(vaultCard).not.toContain('Live')
    expect(vaultCard).not.toContain('sats')
    expect(vaultCard).not.toContain('gacha')
  })

  it('adds vault-claim to Pages without dropping existing slugs or adding a deploy job', () => {
    expect(pages).toContain('vault-claim/frontend/package-lock.json')
    expect(pages).toContain('working-directory: vault-claim/frontend')
    expect(pages).toContain('VITE_BASE: /business-ideas/vault-claim/')
    expect(pages).toContain('VITE_OVERLAY_URL: https://overlay-us-1.bsvb.tech')
    expect(pages).toContain('site/vault-claim')
    expect(pages).toContain('cp -r vault-claim/frontend/dist/. site/vault-claim/')
    expect(pages).toContain('site/tickets')
    expect(pages).toContain('site/titles')
    expect(pages).toContain('site/trace')
    expect(pages).toContain('site/job-escrow')
    expect(pages).toContain('site/records')
    expect(pages).toContain('site/datasets')
    expect(pages).toContain('site/raffle')
    expect(pages).toContain('site/memberships')
    expect(pages).toContain('site/names')
    expect(pages).toContain('titles/frontend/package-lock.json')
    expect(pages).toContain('trace/frontend/package-lock.json')
    expect(pages).toContain('job-escrow/frontend/package-lock.json')
    expect(pages).toContain('working-directory: titles/frontend')
    expect(pages).toContain('working-directory: trace/frontend')
    expect(pages).toContain('working-directory: job-escrow/frontend')
    expect(pages).toContain('cp -r titles/frontend/dist/. site/titles/')
    expect(pages).toContain('cp -r trace/frontend/dist/. site/trace/')
    expect(pages).toContain('cp -r job-escrow/frontend/dist/. site/job-escrow/')
    expect(pages.match(/^  deploy:/gm)).toHaveLength(1)
  })

  it('keeps titles, tickets, trace, and job-escrow catalog cards next to vault claim', () => {
    expect(catalog).toContain('href="./tickets/"')
    expect(catalog).toContain('href="./titles/"')
    expect(catalog).toContain('href="./trace/"')
    expect(catalog).toContain('href="./job-escrow/"')
    expect(catalog).toContain('href="./vault-claim/"')
    expect(catalog).toContain('src="./scenes/trace.webp"')
    expect(catalog).toContain('src="./scenes/job-escrow.webp"')
    expect(catalog).toContain('src="./scenes/vault-claim.webp"')
    expect(catalog).toContain('>Event tickets<')
    expect(catalog).toContain('>Title desk<')
    expect(catalog).toContain('>Trace receipt<')
    expect(catalog).toContain('>Job escrow<')
    expect(catalog).toContain('>Vault Claim<')
  })
})
