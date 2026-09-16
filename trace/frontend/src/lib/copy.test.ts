import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AMOUNT_IN_ADVANCED,
  BUSINESS_CASE_CITATIONS,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
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

describe('Business case page copy is locked', () => {
  it('uses the exact title and five fields in PATTERN order', () => {
    expect(BUSINESS_CASE_TITLE).toBe('Business case')
    expect([...BUSINESS_CASE_FIELDS]).toEqual([
      'Why it exists',
      'Who pays',
      'Market signal',
      'Proof people pay',
      'Demo goal'
    ])
  })

  it('keeps the locked bodies and does not dump Margaret or Sources', () => {
    expect(BUSINESS_CASE_WHY).toBe(
      'When data moves into AI or supply workflows, buyers need a receipt that says where it came from, under what consent, and who contributed it — not a spreadsheet promise. Register provenance once; audit it later.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Data marketplaces, AI labs, and enterprise buyers who must prove lineage (enterprise: compliance / data procurement; grassroots: contributor apps and small providers). Providers pay to register; auditors consume the public receipt.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'DATA Trace (DATA Foundation / IP Strategy, Jun 2026): flagship integrator Kled began registering 1.5 billion user-contributed records on DATA Network; Trace is the public audit / receipt layer (staging API as of docs). Per-record registration fee take-rate is unknown in public pricing.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain analog: DATA Trace + Kled — AI data marketplaces already push provenance registration on-chain at billion-record scale (fee schedule unknown).'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: Supply-chain / lab LIMS audit trails and enterprise data catalogs — orgs already budget for lineage and consent proof even without a chain.'
    )
    expect(BUSINESS_CASE_DEMO).toBe(
      'Provider registers provenance (fee marked or paid) → buyer/auditor opens a public receipt URL → lineage + consent object proves without a spreadsheet. One visit: register → receipt → audit proof.'
    )
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
    expect(joined).not.toMatch(/Revandrew/)
    expect(joined).not.toMatch(/Status:/)
    expect(joined).not.toMatch(/\bBSV\b/)
  })

  it('offers at most three citation chips', () => {
    expect(BUSINESS_CASE_CITATIONS.length).toBeLessThanOrEqual(3)
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual([
      'DATA Foundation',
      'IP Strategy Jun 2026'
    ])
  })

  it('sits once below the head and above the desk, with catalog still Server', () => {
    expect(app).toMatch(/<BusinessCase \/>/)
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const lookup = app.indexOf('<h2>Look up</h2>')
    const register = app.indexOf('<h2>Register</h2>')
    const install = app.indexOf('{showInstall &&')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(lookup).toBeGreaterThan(caseMark)
    expect(register).toBeGreaterThan(lookup)
    expect(install).toBeGreaterThan(register)

    expect(traceCard).toContain('class="badge">Server<')
    expect(traceCard).toContain('Trace receipt')
    expect(traceCard).not.toContain('Live')
    expect(traceCard).not.toContain('Business case')
  })
})
