import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { businessCaseSection, indexPage } from './html.js'

const here = dirname(fileURLToPath(import.meta.url))

describe('402 MCP Business case', () => {
  it('uses the exact title and five fields in PATTERN order', () => {
    const html = indexPage(10)
    assert.match(html, /<section class="business-case" aria-labelledby="business-case-heading">/)
    assert.match(html, /<h2 id="business-case-heading">Business case<\/h2>/)
    assert.equal(html.split('Business case').length - 1, 1)

    const why = html.indexOf('Why it exists')
    const who = html.indexOf('Who pays')
    const market = html.indexOf('Market signal')
    const proof = html.indexOf('Proof people pay')
    const goal = html.indexOf('Demo goal')
    const head = html.indexOf('class="lede"')
    const desk = html.indexOf('class="desk"')
    assert.ok(head > -1 && why > head)
    assert.ok(why < who && who < market && market < proof && proof < goal)
    assert.ok(goal > -1 && desk > goal)
  })

  it('keeps the locked bodies and does not dump Margaret or Sources', () => {
    const section = businessCaseSection()
    assert.match(
      section,
      /Agents and tools need pay-per-call access without signing up for API keys or monthly seats\. Payment on the tool call closes the loop: pay → unlock → useful result — payment is the credential\./
    )
    assert.match(
      section,
      /Tool hosts who want a take rate on usage \(enterprise AI ops and indie MCP authors\)\. Buyers are agent builders and teams whose agents call paid tools — not humans filling a checkout form\./
    )
    assert.match(
      section,
      /OpenRouter’s public pricing: 5\.5% platform fee on card top-ups \(5% crypto\); BYOK overage 5% after free allowance\. Sacra estimates ~\$160M annualized revenue \(Aug 2026\) — third-party, not a filing\. a16z wash-filtered x402 volume ~\$1\.6M in the prior 30 days \(as of 11 Mar 2026\)\. Demo share of paid-MCP GMV is unknown\./
    )
    assert.match(
      section,
      /Other-chain analog: Coinbase x402 \/ Base-facilitated 402 — agents and humans already settle stablecoins on 402 challenges; a16z’s ~\$1\.6M wash-filtered month shows early but real pay-per-query spend\./
    )
    assert.match(
      section,
      /Non-chain analog: OpenRouter’s published ~5–5\.5% take rate on credits\/BYOK — developers pay a gateway fee for one key across many models; Cloudflare paid-tool patterns chase the same habit\./
    )
    assert.match(
      section,
      /Agent hits a paid tool call → pays → gets a useful result \(e\.g\. clean page extract\)\. Prove pay-per-call without keys or seats — not an ops flex\./
    )
    assert.doesNotMatch(section, /Margaret/)
    assert.doesNotMatch(section, /## Sources/)
    assert.doesNotMatch(section, /Revandrew/)
    assert.doesNotMatch(section, /cite-chip/)
  })

  it('sits on free GET / first paint, below the head and above the desk', () => {
    const server = readFileSync(resolve(here, 'server.ts'), 'utf8')
    const start = server.indexOf("app.get('/',")
    const end = server.indexOf("app.all('/mcp'")
    assert.ok(start > -1 && end > start)
    const getRoot = server.slice(start, end)
    assert.match(getRoot, /res\.type\('html'\)\.send\(indexPage\(/)
    assert.doesNotMatch(getRoot, /getServerWallet/)

    const html = indexPage(10)
    assert.match(html, /Charge per call\. No API keys\./)
    assert.match(html, /POST \/mcp/)
    assert.match(html, /extract_article/)
  })

  it('leaves the catalog Server card unchanged', () => {
    const catalog = readFileSync(resolve(here, '../../pages/index.html'), 'utf8')
    const start = catalog.indexOf('card inert demo-mcp')
    const next = catalog.indexOf('demo-treasury')
    assert.ok(start > -1 && next > start)
    const card = catalog.slice(start, next)
    assert.match(card, /<span class="badge">Server<\/span>/)
    assert.match(card, /402 MCP/)
    assert.doesNotMatch(card, />Live</)
    assert.doesNotMatch(card, /Business case/)

    const pagesYml = readFileSync(resolve(here, '../../.github/workflows/pages.yml'), 'utf8')
    assert.doesNotMatch(pagesYml, /402-mcp/)
  })
})
