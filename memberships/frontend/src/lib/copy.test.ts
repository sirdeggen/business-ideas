import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CREATE_BUTTON,
  EYEBROW,
  JOB,
  JOIN_BUTTON,
  RENEW_BUTTON,
  SHOW_EXPIRED,
  SHOW_VALID
} from './copy'
import { sheetTitle } from '../../../protocol/membership'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const html = readFileSync(join(here, '../../index.html'), 'utf8')
const readme = readFileSync(join(here, '../../../README.md'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const cardStart = catalog.indexOf('href="./memberships/"')
const membershipCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const face = app.slice(0, app.indexOf('<details'))
const advanced = app.slice(app.indexOf('<details'))

describe('first-paint copy', () => {
  it('names Membership / Show / Renew and the job line', () => {
    expect(html).toContain('<title>Membership</title>')
    expect(JOB).toBe('A timed key. Renew when it expires.')
    expect(app).toContain('{JOB}')
    expect(app).toContain('{title}')
    expect(sheetTitle({ membership: false, key: false, valid: false })).toBe('Membership')
    expect(sheetTitle({ membership: true, key: true, valid: true })).toBe('Show')
    expect(sheetTitle({ membership: true, key: true, valid: false })).toBe('Renew')
    expect(CREATE_BUTTON).toBe('Create')
    expect(JOIN_BUTTON).toBe('Join')
    expect(RENEW_BUTTON).toBe('Renew')
    expect(SHOW_VALID).toBe('Valid')
    expect(SHOW_EXPIRED).toBe('Expired')
    expect(app).toContain('CREATE_BUTTON')
    expect(app).toContain('JOIN_BUTTON')
    expect(app).toContain('RENEW_BUTTON')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('GMV')
    expect(app).not.toMatch(/Unlock Protocol/)
    expect(app).not.toMatch(/clubhouse/i)
  })

  it('keeps one title: quieter Clubs eyebrow, h1 Membership / Show / Renew', () => {
    expect(EYEBROW).toBe('Clubs')
    expect(app).toContain('className="eyebrow">{EYEBROW}<')
    expect(app).toContain('<h1>{title}</h1>')
    expect(app).toContain('sheetTitle')
    expect(app).not.toContain('className="eyebrow">Membership<')
    expect(app).not.toContain('Connect hero')
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect')
    expect(app).not.toContain('connect wallet')
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Live')
    expect(app).not.toContain('Open UI')
    expect(membershipCard).toContain('class="badge">Server<')
    expect(membershipCard).toContain('>View<')
    expect(membershipCard).not.toContain('Live')
    expect(membershipCard).not.toContain('Open UI')
  })

  it('keeps sats and hex off the face', () => {
    expect(face).toContain('htmlFor="name">Name<')
    expect(face).toContain('htmlFor="days">Duration<')
    expect(face).toContain('htmlFor="price">Price<')
    expect(face).not.toContain('sats')
    expect(face).not.toContain('Price (sats)')
    expect(face).not.toContain('Identity key')
    expect(face).not.toContain('02…')
    expect(face).not.toContain('03…')
    expect(face).not.toMatch(/\$\d/)
    expect(advanced).toContain('Amounts are in sats.')
    expect(advanced).toContain('Duration (seconds)')
    expect(advanced).toContain('Advanced')
    expect(advanced).toContain('shortKey(identityKey')
  })

  it('asks the wallet only on Create, Join, and Renew', () => {
    expect(app).toContain('const session = await ensureWallet()')
    expect(app.split('const session = await ensureWallet()')).toHaveLength(4)
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).toContain('isWalletMissing')
    expect(app).not.toContain('Redeem')
    expect(app).not.toContain('spend-to-redeem')
  })

  it('keeps the catalog card Server + View, not Open UI or Live', () => {
    expect(membershipCard).toContain('A timed key. Renew when it expires.')
    expect(membershipCard).toContain('memberships/README.md')
    expect(membershipCard).not.toContain('sats')
    expect(membershipCard).not.toContain('soon')
    expect(readme).toContain('?m=<membershipId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/m\/:id/)
    expect(app).not.toContain('pathname.match')
  })
})
