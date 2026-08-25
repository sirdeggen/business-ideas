import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const app = readFileSync(join(here, '../App.tsx'), 'utf8')
const html = readFileSync(join(here, '../../index.html'), 'utf8')
const catalog = readFileSync(join(here, '../../../../pages/index.html'), 'utf8')
const cardStart = catalog.indexOf('href="./spend-policy/"')
const spendCard = catalog.slice(cardStart, catalog.indexOf('</article>', cardStart))

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
    expect(app).toContain('Daily cap (sats)')
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

  it('asks the wallet only on Write policy and Spend', () => {
    expect(app).toContain('const session = await ensureWallet()')
    expect(app).toContain('if (!decision.ok) {\n      setActionError(decision.reason)\n      return\n    }')
    expect(app).toContain('const session = await ensureWallet()')
    expect(app.indexOf('if (!decision.ok)')).toBeLessThan(app.lastIndexOf('const session = await ensureWallet()'))
    expect(app).toContain('Install BSV Desktop')
    expect(app).toContain('const showInstall = walletMissing || actionNeedsInstall')
  })
})
