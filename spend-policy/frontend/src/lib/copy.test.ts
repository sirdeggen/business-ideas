import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { paidLine } from './copy'

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

  it('asks the wallet only on Write policy and Spend', () => {
    expect(app).toContain('const session = await ensureWallet()')
    expect(app).toContain('if (!decision.ok) {\n      setActionError(decision.reason)\n      return\n    }')
    expect(app).toContain('const session = await ensureWallet()')
    expect(app.indexOf('if (!decision.ok)')).toBeLessThan(app.lastIndexOf('const session = await ensureWallet()'))
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
  })
})
