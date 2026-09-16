import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
  paidLine
} from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const html = readFileSync(join(here, '../../index.html'), 'utf8')
const readme = readFileSync(join(here, '../../../README.md'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const cardStart = catalog.indexOf('href="./spend-policy/"')
const spendCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))
const face = app.slice(0, app.indexOf('<details'))
const advanced = app.slice(app.indexOf('<details'))

describe('first-paint copy', () => {
  it('names Policy / Spend / Receipt and the job line', () => {
    expect(html).toContain('<title>Spend Policy</title>')
    expect(app).toContain('const JOB = \'A policy. A spend that policy allows.\'')
    expect(app).toContain('{JOB}')
    expect(app).toContain('<h2>Policy</h2>')
    expect(app).toContain('<h2>Spend</h2>')
    expect(app).toContain('<h2>Receipt</h2>')
    expect(app).toContain('Write policy')
    expect(app).toContain('>Spend<')
    expect(face).toContain('Daily cap')
    expect(face).toContain('>Amount<')
    expect(app).not.toContain('tm_anytx')
    expect(app).not.toContain('ls_anytx')
    expect(app).not.toContain('PushDrop')
    expect(app).not.toContain('UTXO')
    expect(app).not.toContain('BRC-')
    expect(app).not.toContain('GMV')
    expect(app).not.toContain('GPV')
    expect(app).not.toMatch(/Rain/)
    expect(app).not.toMatch(/Corpay/)
  })

  it('keeps one title: h1 Spend Policy, quieter Finance eyebrow', () => {
    expect(app).toContain('<h1>Spend Policy</h1>')
    expect(app).toContain('className="eyebrow">Finance<')
    expect(app).not.toContain('className="eyebrow">Spend Policy<')
  })

  it('does not Connect or badge Live on first paint', () => {
    expect(app).not.toContain('Connect')
    expect(app).not.toContain('connect wallet')
    expect(app).not.toContain('Connect wallet')
    expect(app).not.toContain('Live')
    expect(app).not.toContain('Open UI')
    expect(spendCard).toContain('class="badge">Server<')
    expect(spendCard).toContain('>View<')
    expect(spendCard).not.toContain('Live')
    expect(spendCard).not.toContain('Open UI')
  })

  it('does not say live policy in the UI, README, or tests', () => {
    expect(face).toContain('Write a policy.')
    expect(app).not.toContain('live policy')
    expect(app).not.toContain('Write a live policy')
    expect(readme).not.toContain('live policy')
    expect(readme).toContain('writes a policy')
  })

  it('keeps identity hex and sats off the face', () => {
    expect(face).toContain('Allowed payee (name)')
    expect(face).not.toContain('Identity key')
    expect(face).not.toContain('02…')
    expect(face).not.toContain('03…')
    expect(face).not.toContain('sats')
    expect(face).not.toContain('Daily cap (sats)')
    expect(face).not.toContain('Amount (sats)')
    expect(face).not.toMatch(/\$\d/)
    expect(face).not.toContain('dollar')
    expect(advanced).toContain('Identity key')
    expect(advanced).toContain('02…')
    expect(advanced).toContain('Amounts are in sats.')
    expect(advanced).toContain('Advanced')
    expect(app).toContain('assertCanWrite')
    expect(app).toContain('Open Advanced.')
  })

  it('names the payee on the paid line and receipt', () => {
    expect(paidLine('Office vendor')).toBe('Paid Office vendor')
    expect(paidLine('Office vendor')).not.toMatch(/sats/i)
    expect(paidLine('Office vendor')).not.toMatch(/Spent/)
    expect(paidLine('  ')).toBe('Paid.')
    expect(paidLine()).toBe('Paid.')
    expect(app).toContain('paidLine(chosen?.name)')
    expect(app).not.toContain('Spent ${')
    expect(app).toContain('<h2>Receipt</h2>')
    expect(app).toContain('<dt>Payee</dt>')
    expect(app).toContain('row.payeeName?.trim() || \'Payee\'')
  })

  it('shows Business case once below the head, above the desk, without a wallet', () => {
    expect(app).toContain('<BusinessCase />')
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">{JOB}</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const desk = app.indexOf('<h2>Policy</h2>')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(desk).toBeGreaterThan(caseMark)
    const aroundCase = app.slice(Math.max(0, caseMark - 80), caseMark + 40)
    expect(aroundCase).not.toMatch(/wallet/i)
    expect(aroundCase).not.toMatch(/identityKey/)
    expect(spendCard).toContain('class="badge">Server<')
    expect(spendCard).not.toContain('Business case')
  })

  it('asks the wallet only on Write policy and Spend', () => {
    expect(app).toContain('const session = await ensureWallet()')
    expect(app).toContain('if (!decision.ok) {\n      setActionError(decision.reason)\n      return\n    }')
    expect(app).toContain('const session = await ensureWallet()')
    expect(app.indexOf('if (!decision.ok)')).toBeLessThan(app.lastIndexOf('const session = await ensureWallet()'))
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
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
      'Treasurers need to let someone spend without handing them the whole purse. A written policy (allowed payees, daily cap, expiry) plus a spend that only clears if the policy allows turns “trust me” into a checkable rule strangers can read.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Finance teams that issue scoped cards or allowance rules to employees and agents; grassroots clubs that give a volunteer a capped float. The buyer is the policy author (treasurer / finance), not the spender.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'Rain (Jan 2026 Series C): $250M raised at $1.95B valuation; >$3B annualized payment volume across 200+ partners; scoped / agent control cards are a named product line. Ramp (Fortune, Sep 2025): ~$1B annualized revenue as a card + spend-management platform. Demo share of “policy-before-spend” GMV is unknown.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain analog: Rain scoped virtual cards + Agent Control Layer — partners already issue merchant/MCC/amount/expiry-limited cards for humans and agents.'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: Ramp / Brex / Expensify Card merchant rules and spend limits — companies pay for “this person may only spend X at Y.”'
    )
    expect(BUSINESS_CASE_DEMO).toBe(
      'Write a policy (payees, daily cap, expiry) → stranger reads it → spender pays only if allowed; over-cap or wrong payee is refused before payment.'
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
    expect(joined).not.toMatch(/Status:/)
  })

  it('renders the locked fields from copy and not a wallet gate', () => {
    const panel = readFileSync(join(here, '../BusinessCase.tsx'), 'utf8')
    expect(panel).toContain('{BUSINESS_CASE_TITLE}')
    expect(panel).toContain('<dt>Why it exists</dt>')
    expect(panel).toContain('<dt>Who pays</dt>')
    expect(panel).toContain('<dt>Market signal</dt>')
    expect(panel).toContain('<dt>Proof people pay</dt>')
    expect(panel).toContain('<dt>Demo goal</dt>')
    expect(panel).toContain('{BUSINESS_CASE_WHY}')
    expect(panel).toContain('{BUSINESS_CASE_WHO}')
    expect(panel).toContain('{BUSINESS_CASE_MARKET}')
    expect(panel).toContain('{BUSINESS_CASE_PROOF_CHAIN}')
    expect(panel).toContain('{BUSINESS_CASE_PROOF_FIAT}')
    expect(panel).toContain('{BUSINESS_CASE_DEMO}')
    expect(panel).not.toMatch(/wallet/i)
    expect(panel).not.toMatch(/Margaret/)
    expect(panel).not.toMatch(/Sources/)
  })
})
