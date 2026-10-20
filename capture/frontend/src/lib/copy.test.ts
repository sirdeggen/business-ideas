import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AGENT_402_CURL,
  AGENT_402_NOTE,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
  DESK_NOTE,
  DRAFT_JOB,
  EYEBROW,
  FOOTER,
  FUND_BUTTON,
  HASH_NOTE,
  LEDE,
  PRIMARY_COPY,
  PRODUCT,
  SCENE_ALT,
  SCRIPT_NOTE,
  TITLE
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const businessCase = readFileSync(join(here, '../BusinessCase.tsx'), 'utf8')
const css = readFileSync(join(here, '../index.css'), 'utf8')
const html = readFileSync(join(here, '../../index.html'), 'utf8')
const readme = readFileSync(join(here, '../../../README.md'), 'utf8')
const rootReadme = readFileSync(join(here, '../../../../README.md'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const catalogCss = readFileSync(join(here, '../../../../pages/styles.css'), 'utf8')
const pagesYml = readFileSync(join(here, '../../../../.github/workflows/pages.yml'), 'utf8')
const cardStart = catalog.indexOf('id="capture-desk"')
const captureCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const streamStart = catalog.indexOf('href="./streampay/"')
const streamCard = catalog.slice(streamStart, catalog.indexOf('</article>', streamStart))
const grantStart = catalog.indexOf('href="./grants/"')
const grantCard = catalog.slice(grantStart, catalog.indexOf('</article>', grantStart))
const face = app.slice(0, app.indexOf('<details'))

function between(source: string, start: string, end: string): string {
  return source.slice(source.indexOf(start), source.indexOf(end))
}

function channelDelta(left: string, right: string): number {
  const parse = (hex: string) => {
    const value = Number.parseInt(hex.slice(1), 16)
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
  }
  const [ar, ag, ab] = parse(left)
  const [br, bg, bb] = parse(right)
  return Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb)
}

describe('first-paint copy', () => {
  it('names the desk and the job without a wallet gate', () => {
    expect(html).toContain('<title>Capture Desk</title>')
    expect(TITLE).toBe('Capture Desk')
    expect(PRODUCT).toBe('Capture Desk')
    expect(LEDE).toBe('Post a capture of one place. Lock the reward first. Accept a preview, or take the reward back after the deadline.')
    expect(FUND_BUTTON).toBe('Fund')
    expect(app).toContain('{LEDE}')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('Connect')
    expect(app).not.toContain('Open UI')
    expect(app).not.toContain('Live')
    expect(LEDE).not.toMatch(/physical-?\s*AI/i)
    expect(LEDE).not.toMatch(/\bagents?\b/i)
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/Install Desktop/)
      expect(line).not.toMatch(/\bLive\b/)
    }
    expect(face.indexOf('Install Desktop')).toBeGreaterThan(face.indexOf('{showInstall &&'))
    expect(face).toContain('const showInstall = walletMissing || actionNeedsInstall')
  })

  it('keeps one title and a quieter Capture eyebrow', () => {
    expect(EYEBROW).toBe('Capture')
    expect(app).toContain('className="eyebrow">{EYEBROW}<')
    expect(app).toContain('<h1>{TITLE}</h1>')
  })

  it('asks the wallet only at fund, submit, accept, or refund', () => {
    expect(between(app, 'const refreshBoard', 'const openListed')).not.toContain('ensureWallet')
    expect(between(app, 'const openListed', 'const runFund')).not.toContain('ensureWallet')
    expect(between(app, 'const runFund', 'const runSubmit')).toContain('const session = await ensureWallet()')
    expect(between(app, 'const runSubmit', 'const loadEscrow')).toContain('const session = await ensureWallet()')
    expect(between(app, 'const runAccept', 'const runRefund')).toContain('const session = await ensureWallet()')
    expect(between(app, 'const runRefund', 'const startOver')).toContain('const session = await ensureWallet()')
    expect(app.split('const session = await ensureWallet()')).toHaveLength(5)
    expect(app).toContain('isWalletMissing')
    expect(face.indexOf('{DRAFT_JOB}')).toBeGreaterThan(face.indexOf('<BusinessCase />'))
    expect(face.indexOf('{showInstall &&')).toBeGreaterThan(face.indexOf('{DRAFT_JOB}'))
  })

  it('is an open capture call, distinct from a hired job, a security bounty, a dataset, and a trace', () => {
    expect(FOOTER).toBe('An open call for a photo or a video of one place.')
    expect(FOOTER).not.toMatch(/Not a /)
    expect(readme).toMatch(/not Job Escrow/i)
    expect(readme).toMatch(/not Bounty/i)
    expect(readme).toMatch(/not Datasets/i)
    expect(readme).toMatch(/not Trace/i)
    expect(HASH_NOTE).toMatch(/never goes on chain/)
    expect(SCRIPT_NOTE).toMatch(/script enforces/)
    expect(SCRIPT_NOTE).toMatch(/locked to the requester's key/)
    expect(SCRIPT_NOTE).toMatch(/does not read the deadline/)
    expect(SCRIPT_NOTE).toMatch(/does not check that split/)
    expect(SCRIPT_NOTE).not.toMatch(/OP_PUSH_TX/)
    expect(DESK_NOTE).toMatch(/Refunds count once the network timestamps them after the deadline/)
    expect(DESK_NOTE).toMatch(/host-asserted/)
    expect(DESK_NOTE).toMatch(/stay pending/)
    expect(readme).toMatch(/Refunds count once the network timestamps them after the deadline/)
    expect(readme).toMatch(/host-asserted/)
    expect(readme).toMatch(/checked by readers/)
    expect(readme).not.toMatch(/OP_PUSH_TX is v1/)
    expect(readme).not.toMatch(/a block header times/)
    expect(readme).toMatch(/does not enforce the deadline with nLockTime or OP_CHECKLOCKTIMEVERIFY/)
    expect(readme).toMatch(/escrow-<requestId>/)
    expect(readme).toMatch(/DESK_FEE_KEY/)
    expect(readme).toMatch(/capture-fee/)
    expect(readme).toMatch(/manual sweep/)
    expect(app).toContain('{HASH_NOTE}')
    expect(app).toContain('{SCRIPT_NOTE}')
    expect(app).toContain('{DESK_NOTE}')
    expect(readme.slice(0, 500)).not.toMatch(/physical-?\s*AI/i)
    expect(readme.split('\n').slice(0, 8).join('\n')).not.toMatch(/\bagents?\b/i)
  })

  it('keeps the catalog card Server + View at the top of the Server ledger', () => {
    expect(captureCard).toContain('class="badge">Server<')
    expect(captureCard).toContain('>View<')
    expect(captureCard).not.toContain('Live')
    expect(captureCard).not.toContain('Open UI')
    expect(captureCard).toContain('Capture Desk')
    expect(captureCard).toContain(LEDE)
    expect(captureCard).toContain('capture/README.md')
    expect(captureCard).toContain('scenes/capture.webp')
    expect(captureCard).toContain('How to run')
    const ledger = catalog.slice(catalog.indexOf('aria-label="Server"'), catalog.indexOf('aria-label="Live"'))
    const spotlight = catalog.slice(catalog.indexOf('aria-label="Live"'))
    expect(ledger.indexOf('id="capture-desk"')).toBe(ledger.indexOf('id="'))
    expect(ledger.indexOf('id="capture-desk"')).toBeLessThan(ledger.indexOf('id="bounty-desk"'))
    expect(ledger.indexOf('id="bounty-desk"')).toBeLessThan(ledger.indexOf('id="keepsake-desk"'))
    expect(ledger.indexOf('id="keepsake-desk"')).toBeLessThan(ledger.indexOf('id="check-desk"'))
    expect(captureCard).toContain(SCENE_ALT)
    expect(app).toContain('alt={SCENE_ALT}')
    expect(SCENE_ALT).toMatch(/receipt card/)
    expect(spotlight).not.toContain('id="capture-desk"')
    expect(spotlight.match(/class="badge">Live</g)).toHaveLength(2)
    expect(readme).toContain('# Capture Desk (v0)')
    expect(readme).toContain('tm_anytx')
    expect(readme).toContain('ls_anytx')
    expect(rootReadme).toContain('## Capture Desk\n')
    expect(html).toContain('<title>Capture Desk</title>')
    expect(readme).toContain('?r=<requestId>&p=<requester>&tx=<txid>')
    expect(readme).toContain('GitHub Pages 404s')
    expect(app).not.toMatch(/\/r\/:id/)
    expect(catalog.match(/id="capture-desk"/g)).toHaveLength(1)
  })

  it('leaves StreamPay and Grant receipt Live and keeps every catalog neighbor', () => {
    expect(streamCard).toContain('class="badge">Live<')
    expect(grantCard).toContain('class="badge">Live<')
    expect(streamCard).toContain('Pay as they work.')
    expect(grantCard).toContain('A gift for a purpose.')
    for (const slug of [
      'bounty', 'keepsake', 'check', 'scrip', 'boost', 'private-pay', 'closing', 'cover', 'inference', 'feed', 'registry', 'credit', 'handoff', 'vouch', 'kya',
      'vault-claim', 'job-escrow', 'trace', 'titles', 'names', 'memberships', 'datasets',
      'session', 'spend-policy', 'raffle', 'treasury', 'tickets', 'records',
      'receivables', 'grants', 'streampay', 'invoices'
    ]) {
      expect(catalog).toContain(`href="./${slug}/"`)
    }
  })

  it('uses a chip far from every existing chip and adds the capture desk to Pages', () => {
    expect(css).toContain('--seal: #0f766e')
    expect(catalogCss).toContain('.demo-capture')
    expect(catalogCss).toContain('--chip: #5eead4')
    expect(catalogCss.match(/--chip: #5eead4/g)).toHaveLength(1)
    const chips = [...catalogCss.matchAll(/--chip:\s*(#[0-9a-fA-F]{6})/g)].map((match) => match[1] ?? '')
    const named = ['#FFC800', '#a21caf', '#FF7A3D', '#059669', '#c2410c', '#d97706', '#06b6d4']
    for (const other of [...chips, ...named]) {
      if (other.toLowerCase() === '#5eead4') continue
      expect(channelDelta('#5eead4', other)).toBeGreaterThanOrEqual(80)
    }
    expect(pagesYml).toContain('# capture-desk')
    expect(pagesYml).toContain('capture/frontend/package-lock.json')
    expect(pagesYml).toContain('site/capture')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/capture/')
    expect(pagesYml).toContain('pull_request:')
    expect(pagesYml.match(/^  deploy:/gm)).toHaveLength(1)
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'feed', 'inference', 'cover', 'scenes', 'closing',
      'private-pay', 'boost', 'scrip', 'check', 'keepsake', 'bounty', 'capture'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
  })

  it('puts the business case under the head and above the form', () => {
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const form = app.indexOf('{DRAFT_JOB}')
    expect(caseMark).toBeGreaterThan(head)
    expect(form).toBeGreaterThan(caseMark)
    expect(app.slice(0, caseMark)).not.toContain('{!request &&')
    expect(app.slice(0, caseMark)).not.toContain('{request &&')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    expect(businessCase).toContain('<details')
    expect(businessCase).toContain('open={expanded}')
    expect(businessCase).toContain('<summary id="business-case-heading">{BUSINESS_CASE_TITLE}</summary>')
    expect(app.indexOf('{HASH_NOTE}')).toBeGreaterThan(caseMark)
    expect(app.indexOf('{HASH_NOTE}')).toBeLessThan(form)
    expect(captureCard).not.toContain('Business case')
    expect(app).toContain('id="request-draft"')
    expect(app).toContain('id="capture-submit"')
    expect(app).toContain('id="capture-board"')
    expect(app).toContain('id="agent-402"')
    expect(app).toContain('{AGENT_402_CURL}')
    expect(AGENT_402_NOTE).toMatch(/Example only/)
    expect(AGENT_402_CURL).toMatch(/curl -X POST/)
    expect(AGENT_402_CURL).toMatch(/example\.invalid/)
  })

  it('says the raw file stays off chain and the fund is broadcast', () => {
    expect(HASH_NOTE).toMatch(/Only the hash and the receipt/)
    expect(readme).toContain('broadcast when you Fund')
    expect(readme).toContain('tm_anytx')
    expect(rootReadme).toContain(LEDE)
    expect(BUSINESS_CASE_WHY).not.toMatch(/\bBSV\b/)
    expect(LEDE).not.toMatch(/\bBSV\b/)
    expect(app).toContain('<summary>How it works</summary>')
    const how = app.slice(app.indexOf('<summary>How it works</summary>'), app.indexOf('<summary>Advanced</summary>'))
    expect(how).toContain('{LOCAL_NOTE}')
    expect(how).toContain('{FEE_HELPER}')
  })
})

describe('Business case page copy is locked', () => {
  it('uses the exact title and five fields in order', () => {
    expect(BUSINESS_CASE_TITLE).toBe('Business case')
    expect([...BUSINESS_CASE_FIELDS]).toEqual([
      'Why it exists',
      'Who pays',
      'Market signal',
      'Proof people pay',
      'Demo goal'
    ])
    const body = businessCase.slice(businessCase.indexOf('<dl>'))
    const positions = BUSINESS_CASE_FIELDS.map((field) => body.indexOf(field))
    expect(positions.every((position) => position >= 0)).toBe(true)
    expect([...positions].sort((left, right) => left - right)).toEqual(positions)
    expect(BUSINESS_CASE_WHY).toBe(
      'Insurers, property managers, retailers and robotics teams often need fresh photos or video of one specific place, quickly, without sending staff. A requester posts the job with the reward set aside up front, checks a watermarked preview before paying, and gets the money back if nobody delivers by the deadline.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Requesters such as insurers, property managers, retailers, robotics teams and AI agents that pay per request. Local contributors earn the reward. The desk keeps about 10% on accepted captures plus a small processing fee.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'Vangrid\'s public bounty board (self-reported, read Oct 2026): ~$620k in accepted bounties, a 97% accept rate and a ~6h median time to accept, with $385k accepted in September. It charges 10% plus ~$5 processing. Total market size for on-demand field capture is unknown.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain analog: Vangrid. Companies and AI agents fund capture bounties up front and pay a 10% fee on accept.'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: shelf-audit and mystery-shopper gig apps already pay crowds per photo task.'
    )
    expect(`${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`).toBe(BUSINESS_CASE_PROOF)
    expect(BUSINESS_CASE_DEMO).toBe(
      'Post a funded request, receive a signed capture with a watermarked preview, accept it, and see one payment split between the contributor, the desk fee and the processing fee, or get a full refund after the deadline. Raw footage stays off-chain.'
    )
    expect(DRAFT_JOB.length).toBeGreaterThan(20)
    const business = [
      BUSINESS_CASE_WHY,
      BUSINESS_CASE_WHO,
      BUSINESS_CASE_MARKET,
      BUSINESS_CASE_PROOF_CHAIN,
      BUSINESS_CASE_PROOF_FIAT,
      BUSINESS_CASE_DEMO
    ].join('\n')
    expect(business).not.toMatch(/UTXO/)
    expect(business).not.toMatch(/identity key/i)
    expect(business).not.toMatch(/Message Box/)
    expect(business).not.toMatch(/\bguaranteed\b/i)
    expect(business).not.toMatch(/\binsured\b/i)
    expect(business).not.toMatch(/\bprotected\b/i)
    expect(BUSINESS_CASE_MARKET).toMatch(/self-reported/)
  })
})
