import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_LIST,
  FOOTER,
  ISSUE_BUTTON,
  ISSUE_JOB,
  LEDE,
  LIST_HEADING,
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
const claimCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const shell = app.slice(app.indexOf('function Shell'))
const jsx = shell.slice(shell.indexOf('return ('))
const face = jsx.slice(0, jsx.indexOf('<details'))
const issueFn = app.slice(app.indexOf('const runIssue'), app.indexOf('const runTransfer'))
const transferFn = app.slice(app.indexOf('const runTransfer'), app.indexOf('const runRedeem'))
const redeemFn = app.slice(app.indexOf('const runRedeem'), app.indexOf('const retry'))

describe('first-paint copy', () => {
  it('names the desk and the job, not a protocol sentence', () => {
    expect(TITLE).toBe('Vault claim')
    expect(LIST_HEADING).toBe('Claims')
    expect(LEDE).toBe('Claim a vaulted item. Transfer the claim. Burn it to redeem.')
    expect(TRANSFER_BUTTON).toBe('Transfer claim')
    expect(REDEEM_BUTTON).toBe('Redeem (burn)')
    expect(ISSUE_BUTTON).toBe('Issue a claim')
    expect(ISSUE_JOB).toBe('A label, the item, and a price if it’s a sale.')
    expect(EMPTY_LIST).toBe('No claims yet.')
    expect(FOOTER).toBe('Not a titled document. Not an event pass. Not a random pack.')
    expect(app).toContain('{LIST_HEADING}')
    expect(app).toContain('htmlFor="price">Price<')
    expect(app).toContain('TRANSFER_BUTTON')
    expect(app).toContain('REDEEM_BUTTON')
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
    expect(app).not.toContain('gacha')
    expect(app).not.toContain('loot')
  })

  it('is a vaulted physical claim, not Titles, Tickets, or a random pack', () => {
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/DePIN/i)
      expect(line).not.toMatch(/USDC/i)
      expect(line).not.toMatch(/APY/i)
      expect(line).not.toMatch(/\$0\.00/)
      expect(line).not.toMatch(/\bLive\b/)
      expect(line).not.toMatch(/\bsats?\b/i)
      expect(line).not.toMatch(/CargoX/i)
      expect(line).not.toMatch(/gacha/i)
      expect(line).not.toMatch(/loot box/i)
    }
    expect(FOOTER).toMatch(/Not a titled document/)
    expect(FOOTER).toMatch(/Not an event pass/)
    expect(FOOTER).toMatch(/Not a random pack/)
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Connecting…')
    expect(app).not.toContain('identity key')
    expect(app).not.toContain('{identityKey}')
    expect(app).not.toContain('{row.holder}')
    expect(app).not.toMatch(/\$0\.00/)
    expect(app).not.toMatch(/gacha/i)
    expect(app).not.toMatch(/loot box/i)
  })

  it('keeps hashes and holder hex under Advanced, holder as a name on the face', () => {
    expect(app).toContain('<summary>Advanced</summary>')
    expect(app).toContain('Sample hash')
    expect(app).toContain('heldLine(names[row.holder])')
    expect(app).toContain('STATUS_HELD')
    expect(app).toContain('STATUS_REDEEMED')
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

  it('paints a courtyard vault desk, not paper-and-navy', () => {
    expect(css).toContain('--paper: #e6dcc8')
    expect(css).toContain('--ink: #3a2a1a')
    expect(css).toContain('--chip: #c45c26')
    expect(css).toContain('--title: #8b3a1a')
    expect(css).not.toMatch(/--paper:\s*#F7F5F2/i)
    expect(css).not.toMatch(/--ink:\s*#1F3A5F/i)
    expect(css).toContain('border: 1px solid var(--hair)')
    expect(app).toContain('scene-crop')
    expect(app).toContain('scenes/vault-claim.webp')
  })

  it('shows the claim list before wallet chrome', () => {
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

  it('asks the wallet only on Issue / Transfer / Redeem, after the form is ready', () => {
    expect(issueFn.indexOf('assertCanIssue')).toBeLessThan(issueFn.indexOf('ensureWallet'))
    expect(transferFn.indexOf('if (transferOpen !== row.claimId)')).toBeLessThan(transferFn.indexOf('ensureWallet'))
    expect(transferFn.indexOf('.trim()')).toBeLessThan(transferFn.indexOf('ensureWallet'))
    expect(redeemFn.indexOf('if (redeemOpen !== row.claimId)')).toBeLessThan(redeemFn.indexOf('ensureWallet'))
    expect(app).toContain('const session = await ensureWallet()')
    expect(app).toContain('const canActOn')
    expect(app).toContain('{canActOn(row) &&')
    expect(transferFn).toContain('if (identityKey && !isHolder(row, identityKey)) return')
    expect(redeemFn).toContain('if (identityKey && !isHolder(row, identityKey)) return')
    expect(redeemFn).not.toContain('setActionError(NOT_HOLDER)')
    expect(transferFn).not.toContain('setActionError(NOT_HOLDER)')
  })

  it('keeps the catalog card Server + View, not Open UI or Live', () => {
    expect(claimCard).toContain('class="badge">Server<')
    expect(claimCard).toContain('>View<')
    expect(claimCard).toContain('How to run')
    expect(claimCard).toContain('Claim a vaulted item. Transfer the claim. Burn it to redeem.')
    expect(claimCard).not.toContain('Open UI')
    expect(claimCard).not.toContain('soon')
    expect(claimCard).not.toContain('Live')
    expect(claimCard).not.toContain('sats')
    expect(claimCard).not.toContain('gacha')
    expect(claimCard).not.toContain('Tickets')
    expect(claimCard).not.toContain('Title desk')
  })

  it('adds vault-claim to Pages without dropping existing slugs or a sibling deploy job', () => {
    expect(pages).toContain('vault-claim/frontend/package-lock.json')
    expect(pages).toContain('working-directory: vault-claim/frontend')
    expect(pages).toContain('VITE_BASE: /business-ideas/vault-claim/')
    expect(pages).toContain('VITE_OVERLAY_URL: https://overlay-us-1.bsvb.tech')
    expect(pages).toContain('site/vault-claim')
    expect(pages).toContain('cp -r vault-claim/frontend/dist/. site/vault-claim/')
    expect(pages).toContain('site/tickets')
    expect(pages).toContain('site/receivables')
    expect(pages).toContain('site/invoices')
    expect(pages).toContain('site/treasury')
    expect(pages).toContain('site/streampay')
    expect(pages).toContain('site/grants')
    expect(pages).toContain('site/records')
    expect(pages).toContain('site/raffle')
    expect(pages).toContain('site/spend-policy')
    expect(pages).toContain('site/session')
    expect(pages).toContain('site/datasets')
    expect(pages).toContain('site/memberships')
    expect(pages).toContain('site/names')
    expect(pages).toContain('site/titles')
    expect(pages).toContain('site/scenes')
    expect(pages.match(/^  deploy:/gm)).toHaveLength(1)
  })

  it('keeps sibling catalog cards next to vault claim', () => {
    expect(catalog).toContain('href="./tickets/"')
    expect(catalog).toContain('href="./titles/"')
    expect(catalog).toContain('href="./vault-claim/"')
    expect(catalog).toContain('Title desk</h2>')
    expect(catalog).toContain('Vault claim</h2>')
  })
})
