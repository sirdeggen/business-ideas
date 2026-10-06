import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BOOSTING_BUTTON,
  BOOST_12_BUTTON,
  BOOST_24_BUTTON,
  BUSINESS_CASE_CITATIONS,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
  BUYING_BUTTON,
  BUY_BUTTON,
  EXPORT_BUTTON,
  EYEBROW,
  FEE_FACE,
  HONESTY_LINE,
  JOB,
  PRODUCT,
  PROFILE_FEE_LABEL,
  SCENE_ALT,
  STRANGER_LINE
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const businessCase = readFileSync(join(here, '../BusinessCase.tsx'), 'utf8')
const walletContext = readFileSync(join(here, '../context/WalletContext.tsx'), 'utf8')
const css = readFileSync(join(here, '../index.css'), 'utf8')
const html = readFileSync(join(here, '../../index.html'), 'utf8')
const readme = readFileSync(join(here, '../../../README.md'), 'utf8')
const rootReadme = readFileSync(join(here, '../../../../README.md'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const catalogCss = readFileSync(join(here, '../../../../pages/styles.css'), 'utf8')
const pagesYml = readFileSync(join(here, '../../../../.github/workflows/pages.yml'), 'utf8')
const overlaySrc = readFileSync(join(here, 'overlay.ts'), 'utf8')

function card(href: string): string {
  const start = catalog.indexOf(`href="${href}"`)
  return catalog.slice(start, catalog.indexOf('</article>', start))
}

const boostCard = card('./boost/')
const streamCard = card('./streampay/')
const grantCard = card('./grants/')
const face = app.slice(0, app.indexOf('<details'))

describe('first-paint copy', () => {
  it('names Boost Desk and the listing job', () => {
    expect(html).toContain('<title>Boost Desk</title>')
    expect(PRODUCT).toBe('Boost Desk')
    expect(JOB).toBe('Pay for a verified listing. Buy a timed boost. Ranking is on-chain.')
    expect(app).toContain('{PRODUCT}')
    expect(app).toContain('{JOB}')
    expect(EYEBROW).toBe('Boost')
    expect(BUY_BUTTON).toBe('Buy profile')
    expect(BOOST_12_BUTTON).toBe('Buy 12-hour boost')
    expect(BOOST_24_BUTTON).toBe('Buy 24-hour boost')
    expect(EXPORT_BUTTON).toBe('Export reading')
    expect(BUYING_BUTTON).toBe('Buying profile…')
    expect(BOOSTING_BUTTON).toBe('Buying boost…')
    expect(PROFILE_FEE_LABEL).toBe('Profile fee')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('Approve in wallet')
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('connect wallet')
    expect(walletContext).not.toContain('useEffect')
    expect(app).not.toContain('>Live<')
    expect(boostCard).toContain('class="badge">Server<')
    expect(boostCard).toContain('>View<')
    expect(boostCard).not.toContain('Live')
    expect(boostCard).not.toContain('Open UI')
    expect(catalog.match(/class="badge">Live</g)).toHaveLength(2)
  })

  it('shows the quote and the business case without a wallet', () => {
    expect(face).toContain('{PROFILE_FEE_LABEL}')
    expect(face).toContain('{FEE_FACE}')
    expect(face).toContain('{HONESTY_LINE}')
    expect(face).toContain('{STRANGER_LINE}')
    expect(face).toContain('{EXPORT_BUTTON}')
    expect(face).toContain('packFace(pack)')
    expect(FEE_FACE).toContain('desk')
    expect(HONESTY_LINE).toContain('does not hold')
    expect(HONESTY_LINE).toContain('not a background check')
    expect(STRANGER_LINE).toContain('No wallet')
    const exportFn = app.slice(app.indexOf('const runExport'))
    expect(exportFn.slice(0, exportFn.indexOf('const runOpen'))).not.toContain('ensureWallet')
  })

  it('uses busy labels on Buy profile and Buy boost', () => {
    expect(app).toContain('busy === \'buy\' ? BUYING_BUTTON : BUY_BUTTON')
    expect(app).toContain('packButton(pack, busy)')
    for (const label of [BUYING_BUTTON, BOOSTING_BUTTON, BUY_BUTTON, BOOST_12_BUTTON, BOOST_24_BUTTON, EXPORT_BUTTON]) {
      expect(label.toLowerCase()).not.toContain('wallet')
      expect(label.toLowerCase()).not.toContain('approve in')
    }
  })

  it('asks the wallet only on Buy profile and Buy boost', () => {
    expect(app.split('const session = await ensureWallet()')).toHaveLength(3)
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('isWalletMissing')
    expect(app).toContain('scrollIntoView')
  })

  it('keeps the catalog card Server + View, above Closing, and the prior Live badges', () => {
    expect(boostCard).toContain('Boost Desk')
    expect(boostCard).toContain(JOB)
    expect(boostCard).toContain('boost/README.md')
    expect(boostCard).toContain('scenes/boost.webp')
    expect(boostCard).toContain('How to run')
    expect(boostCard).toContain('class="badge">Server<')
    expect(boostCard).toContain('>View<')
    expect(boostCard).not.toContain('Live')
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(readme).toContain('# Boost Desk (v0)')
    expect(readme).toContain('Distinct from Names / KYA / Vouch / Feed')
    expect(readme).toContain('What is on-chain vs attested')
    expect(rootReadme).toContain('## Boost Desk\n')
    expect(html).toContain('<title>Boost Desk</title>')
    expect(readme).toContain('?p=<profileId>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/p\/:id/)
    expect(catalog.indexOf('href="./boost/"')).toBeGreaterThan(-1)
    expect(catalog.indexOf('href="./private-pay/"')).toBeGreaterThan(-1)
    expect(catalog.indexOf('href="./closing/"')).toBeGreaterThan(-1)
    expect(catalog.indexOf('href="./boost/"')).toBeLessThan(catalog.indexOf('href="./private-pay/"'))
    expect(catalog.indexOf('href="./private-pay/"')).toBeLessThan(catalog.indexOf('href="./closing/"'))
    expect(boostCard).toContain(SCENE_ALT)
    expect(app).toContain('SCENE_ALT')
    expect(SCENE_ALT).toContain('magenta jacket')
  })

  it('adds boost to Pages without dropping earlier desks', () => {
    expect(catalogCss).toContain('.demo-boost')
    expect(css).toContain('--seal:')
    expect(css).toContain('Syne')
    expect(css).not.toContain('#4338ca')
    expect(css).not.toContain('#4f6ad6')
    expect(css).not.toContain('#d97706')
    expect(css).not.toContain('#84cc16')
    expect(pagesYml.match(/# boost-desk/g)).toHaveLength(3)
    expect(pagesYml.match(/# private-pay-desk/g)).toHaveLength(3)
    expect(pagesYml.match(/# cover-desk/g)).toHaveLength(3)
    expect(pagesYml.match(/# closing-desk/g)).toHaveLength(3)
    expect(pagesYml.match(/# inference-desk/g)).toHaveLength(3)
    expect(pagesYml).toContain('# credit-desk')
    expect(pagesYml).toContain('# registry-desk')
    expect(pagesYml).toContain('boost/frontend/package-lock.json')
    expect(pagesYml).toContain('cover/frontend/package-lock.json')
    expect(pagesYml).toContain('closing/frontend/package-lock.json')
    expect(pagesYml).toContain('feed/frontend/package-lock.json')
    expect(pagesYml).toContain('site/boost')
    expect(pagesYml).toContain('site/private-pay')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/boost/')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/private-pay/')
    expect(pagesYml).toContain('site/closing site/private-pay site/boost')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/closing/')
    expect(overlaySrc).toContain('TopicBroadcaster')
    expect(overlaySrc).toContain('tm_anytx')
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'feed', 'inference', 'cover', 'closing', 'private-pay', 'boost', 'scenes'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
    for (const href of [
      './tickets/', './receivables/', './invoices/', './treasury/', './streampay/',
      './grants/', './records/', './raffle/', './spend-policy/', './session/',
      './datasets/', './memberships/', './names/', './titles/', './trace/',
      './job-escrow/', './vault-claim/', './kya/', './vouch/', './handoff/',
      './credit/', './registry/', './feed/', './inference/', './cover/', './closing/', './private-pay/', './boost/'
    ]) {
      expect(catalog).toContain(`href="${href}"`)
    }
  })

  it('shows Business case once below the head, above the desk, without a wallet', () => {
    expect(app).toContain('<BusinessCase />')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{JOB}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const desk = app.indexOf('{!profileId && (')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(desk).toBeGreaterThan(caseMark)
    const rendered = app.slice(app.lastIndexOf('return ('))
    expect(rendered.slice(0, rendered.indexOf('<BusinessCase />'))).not.toContain('ensureWallet')
    expect(rendered.slice(0, rendered.indexOf('<BusinessCase />'))).not.toContain('connect()')
    expect(businessCase).toContain('<details className="business-case" open>')
  })
})

describe('Business case page copy is locked', () => {
  it('uses the exact title and five fields', () => {
    expect(BUSINESS_CASE_TITLE).toBe('Business case')
    expect([...BUSINESS_CASE_FIELDS]).toEqual([
      'Why it exists',
      'Who pays',
      'Market signal',
      'Proof people pay',
      'Demo goal'
    ])
    expect(BUSINESS_CASE_WHY.startsWith('Local businesses, events, and vendors')).toBe(true)
    expect(BUSINESS_CASE_WHO.startsWith('The business, the event host')).toBe(true)
    expect(BUSINESS_CASE_MARKET).toContain('$5.39M')
    expect(BUSINESS_CASE_MARKET).toContain('$299')
    expect(BUSINESS_CASE_MARKET).toContain('$499')
    expect(BUSINESS_CASE_MARKET).toContain('12–24 hours')
    expect(BUSINESS_CASE_MARKET).toContain('$2,000')
    expect(BUSINESS_CASE_MARKET).toContain('not the whole Screener business')
    expect(BUSINESS_CASE_PROOF_CHAIN.startsWith('Other-chain analog:')).toBe(true)
    expect(BUSINESS_CASE_PROOF_FIAT.startsWith('Non-chain analog:')).toBe(true)
    expect(BUSINESS_CASE_PROOF_CHAIN).toContain('DEX Screener')
    expect(BUSINESS_CASE_DEMO.startsWith('In one visit')).toBe(true)
    expect(businessCase).toContain('BUSINESS_CASE_FIELDS.map')
    expect(businessCase).toContain('<dt>{label}</dt>')
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual(['DefiLlama DEX Screener'])
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
    expect(joined).not.toMatch(/\bBSV\b/)
    expect(joined.split('\n')[0]).not.toMatch(/wallet/i)
  })
})
