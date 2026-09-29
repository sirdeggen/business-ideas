import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BUSINESS_CASE_CITATIONS,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
  EMPTY_LIST,
  EYEBROW,
  FOOTER,
  LEDE,
  LIST_HEADING,
  METER_HEADING,
  PAID_LINE,
  PAY_BUTTON,
  POST_BUTTON,
  POST_JOB,
  PRIMARY_COPY,
  RECEIPT_HEADING,
  TITLE,
  receiptFace
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const businessCase = readFileSync(join(here, '../BusinessCase.tsx'), 'utf8')
const css = readFileSync(join(here, '../index.css'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const pagesYml = readFileSync(join(here, '../../../../.github/workflows/pages.yml'), 'utf8')
const cardStart = catalog.indexOf('href="./inference/"')
const inferenceCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const ledger = catalog.slice(catalog.indexOf('aria-label="Server"'), catalog.indexOf('aria-label="Live"'))
const live = catalog.slice(catalog.indexOf('aria-label="Live"'))
const face = app.slice(0, app.indexOf('<details'))
const advanced = app.slice(app.indexOf('<details'))

describe('first-paint copy', () => {
  it('names the desk and the job', () => {
    expect(TITLE).toBe('Inference Desk')
    expect(EYEBROW).toBe('Desk')
    expect(LEDE).toBe('Pay per call. Get a hash-attested usage receipt.')
    expect(LIST_HEADING).toBe('Models')
    expect(EMPTY_LIST).toBe('No models yet.')
    expect(PAY_BUTTON).toBe('Pay per call')
    expect(POST_BUTTON).toBe('List model')
    expect(POST_JOB).toBe('A label, a model, and a price per call.')
    expect(METER_HEADING).toBe('Meter')
    expect(FOOTER).toBe('Not a signed reading. Not a file listing.')
    expect(app).toContain('{LEDE}')
    expect(app).toContain('{LIST_HEADING}')
    expect(app).toContain('{METER_HEADING}')
    expect(face).toContain('htmlFor="price">Price<')
    expect(face).toContain('htmlFor="pack">Pack<')
    expect(face).not.toContain('Price (sats)')
    expect(face).not.toContain('sats')
    expect(face).not.toContain('formatSats')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('Live')
    expect(app).not.toContain('Open UI')
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('useEffect(() => {\n    void connect(')
  })

  it('keeps protocol detail under Advanced', () => {
    expect(advanced).toContain('<summary>Advanced</summary>')
    expect(advanced).toContain('{AMOUNTS_LINE}')
    expect(advanced).toContain('shortKey(identityKey')
    expect(advanced).toContain('Response hash')
    expect(face).not.toContain('Response hash')
    expect(face).not.toContain('Wallet key')
  })

  it('names a receipt by the response hash and the meter', () => {
    expect(RECEIPT_HEADING).toBe('Usage receipt')
    expect(PAID_LINE).toBe('Paid')
    const faceText = receiptFace({
      responseHash: 'ab'.repeat(32),
      remaining: 4000,
      paid: true
    })
    expect(faceText).toContain('Paid')
    expect(faceText).not.toMatch(/\bsats?\b/i)
    expect(face).toContain('{receipt.response}')
    expect(face).toContain('receipt.usage.responseHash')
    expect(face).toContain('PAID_LINE')
    expect(face).toContain('PREVIEW_LINE')
  })

  it('shows models and the meter before list-a-model and wallet chrome', () => {
    const list = app.indexOf('{LIST_HEADING}')
    const meter = app.indexOf('{METER_HEADING}')
    const post = app.indexOf('{POST_HEADING}')
    const install = app.indexOf('{showInstall &&')
    expect(list).toBeGreaterThan(-1)
    expect(meter).toBeGreaterThan(list)
    expect(post).toBeGreaterThan(meter)
    expect(install).toBeGreaterThan(post)
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
    expect(app).toContain('Install BSV Desktop')
    expect(face).toContain('onClick={runPreview}')
    expect(face).toContain('onClick={runVerify}')
  })

  it('keeps primary copy free of sats theatre and a Live badge', () => {
    for (const line of PRIMARY_COPY) {
      expect(line).not.toMatch(/\bsats?\b/i)
      expect(line).not.toMatch(/\bLive\b/)
      expect(line).not.toMatch(/\$0\.00/)
      expect(line).not.toMatch(/USDC/i)
    }
    expect(css).not.toContain('#f7f5f2')
    expect(css).toContain('--signal')
  })

  it('keeps the catalog card Server + View at the top of the ledger, and Pages still builds the other desks', () => {
    expect(ledger.indexOf('href="./inference/"')).toBeLessThan(ledger.indexOf('href="./feed/"'))
    expect(inferenceCard).toContain('class="badge">Server<')
    expect(inferenceCard).toContain('>View<')
    expect(inferenceCard).toContain('How to run')
    expect(inferenceCard).toContain('Pay per call. Get a hash-attested usage receipt.')
    expect(inferenceCard).toContain('Inference Desk')
    expect(inferenceCard).not.toContain('Open UI')
    expect(inferenceCard).not.toContain('Live')
    expect(inferenceCard).not.toContain('sats')
    expect(live).toContain('streampay')
    expect(live).toContain('grants')
    expect(live).not.toContain('inference')
    expect(pagesYml).toContain('# inference-desk')
    expect(pagesYml).toContain('inference/frontend/package-lock.json')
    expect(pagesYml).toContain('Install and build inference')
    expect(pagesYml).toContain('VITE_BASE: /business-ideas/inference/')
    expect(pagesYml).toContain('site/inference')
    expect(pagesYml).toContain('cp -r inference/frontend/dist/. site/inference/')
    expect(pagesYml).toContain('feed/frontend/package-lock.json')
    expect(pagesYml).toContain('credit/frontend/package-lock.json')
    expect(pagesYml).toContain('registry/frontend/package-lock.json')
    expect(pagesYml).toContain('site/feed')
    expect(pagesYml).toContain('site/credit')
    expect(pagesYml).toContain('site/registry')
    expect(pagesYml).toContain('site/streampay')
    expect(pagesYml).toContain('site/grants')
    expect(pagesYml).toContain('site/handoff site/credit site/registry site/scenes')
    for (const slug of [
      'tickets', 'receivables', 'invoices', 'treasury', 'streampay', 'grants',
      'records', 'raffle', 'spend-policy', 'session', 'datasets', 'memberships',
      'names', 'titles', 'trace', 'job-escrow', 'vault-claim', 'kya', 'vouch',
      'handoff', 'credit', 'registry', 'feed', 'inference', 'scenes'
    ]) {
      expect(pagesYml).toContain(`site/${slug}`)
    }
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
    const why = businessCase.indexOf('<dt>Why it exists</dt>')
    const who = businessCase.indexOf('<dt>Who pays</dt>')
    const market = businessCase.indexOf('<dt>Market signal</dt>')
    const proof = businessCase.indexOf('<dt>Proof people pay</dt>')
    const demo = businessCase.indexOf('<dt>Demo goal</dt>')
    expect(who).toBeGreaterThan(why)
    expect(market).toBeGreaterThan(who)
    expect(proof).toBeGreaterThan(market)
    expect(demo).toBeGreaterThan(proof)
  })

  it('keeps the locked bodies and does not dump sources', () => {
    expect(BUSINESS_CASE_WHY).toBe(
      'Teams burn money on AI API calls and want to pay only for what they use — with a receipt that ties spend to an attested response, not a monthly mystery bill.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Product teams, agent builders, and grassroots apps that meter AI usage; providers who want micropayments instead of invoice net-30.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'Venice shows ~$825k/30d on-chain VVV buy-and-burn alone; DefiLlama notes subscription/API/credit revenue settles off-chain and is excluded (so real AI take is larger). Aethir GPU compute ~$915k/30d protocol revenue. X posts on AI inference / marketplace fees ~649/7d.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain analog: Venice AI subscriptions driving on-chain burns; Aethir developer GPU service fees.'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: OpenAI / Anthropic / OpenRouter API credit packs and metered inference billing.'
    )
    expect(BUSINESS_CASE_DEMO).toBe(
      'Pay for one inference (or a small credit pack), get an attested response hash + usage receipt, and see the meter decrement.'
    )
    expect(BUSINESS_CASE_WHY.startsWith('BSV')).toBe(false)
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual([
      'Venice',
      'DefiLlama',
      'Aethir'
    ])
    expect(businessCase).not.toMatch(/Sources/)
    const joined = [
      BUSINESS_CASE_WHY,
      BUSINESS_CASE_WHO,
      BUSINESS_CASE_MARKET,
      BUSINESS_CASE_PROOF_CHAIN,
      BUSINESS_CASE_PROOF_FIAT,
      BUSINESS_CASE_DEMO
    ].join('\n')
    expect(joined).not.toMatch(/## Sources/)
    expect(joined).not.toMatch(/\bLive\b/)
    expect(joined.slice(0, 12)).not.toMatch(/BSV/i)
  })

  it('sits once below the head and above the model list', () => {
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{LEDE}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const list = app.indexOf('{LIST_HEADING}')
    expect(caseMark).toBeGreaterThan(head)
    expect(list).toBeGreaterThan(caseMark)
    expect(inferenceCard).not.toContain('Business case')
    expect(face).toContain('<BusinessCase />')
  })
})
