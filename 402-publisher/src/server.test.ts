import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { PrivateKey } from '@bsv/sdk'
import type { Server } from 'node:http'

process.env.PRIVATE_KEY ??= PrivateKey.fromRandom().toHex()
process.env.HUMAN_SATS = '100'
process.env.CRAWLER_SATS = '500'

const { createApp } = await import('./server.js')

describe('402 Press routes', () => {
  let server: Server
  let base: string

  before(async () => {
    const app = createApp()
    server = await new Promise<Server>((resolve) => {
      const started = app.listen(0, '127.0.0.1', () => resolve(started))
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('test server did not bind a port')
    }
    base = `http://127.0.0.1:${address.port}`
  })

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('keeps GET / free', async () => {
    const res = await fetch(`${base}/`)
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.match(html, /402 Press/)
    assert.match(html, /why-402-not-subscriptions/)

    assert.match(html, /<section class="business-case" aria-labelledby="business-case-title">/)
    assert.match(html, /<h2 id="business-case-title">Business case<\/h2>/)
    assert.equal(html.split('Business case').length - 1, 1)

    const why = html.indexOf('Why it exists')
    const who = html.indexOf('Who pays')
    const market = html.indexOf('Market signal')
    const proof = html.indexOf('Proof people pay')
    const goal = html.indexOf('Demo goal')
    const lede = html.indexOf('class="lede"')
    const firstCard = html.indexOf('why-402-not-subscriptions')
    assert.ok(lede > -1 && why > lede)
    assert.ok(why < who && who < market && market < proof && proof < goal)
    assert.ok(goal > -1 && firstCard > goal)

    assert.match(html, /a price tag, not a hard wall/)
    assert.match(html, /The publisher keeps the meter and the audience relationship/)
    assert.match(html, /Independent publishers and media brands testing pay-per-crawl/)
    assert.match(html, /Hosting customers already pay for the press/)
    assert.match(html, /Ghost: ~\$11\.1M ARR, ~30\.6K active customers/)
    assert.match(html, /Cloudflare Pay Per Crawl public GMV is unknown/)
    assert.match(html, /Other-chain analog: Coinbase x402 — agents and humans paying on 402 challenges/)
    assert.match(html, /Non-chain analog: Ghost\(Pro\) hosting ARR/)
    assert.match(html, /Publish a few articles → human fetch at one price → crawler fetch at a higher price/)
    assert.match(html, />Ghost about</)
    assert.match(html, />x402</)
    assert.match(html, />Cloudflare PPC</)
    assert.doesNotMatch(html, /Margaret frame/)
    assert.doesNotMatch(html, /## Sources/)
    assert.doesNotMatch(html, /Revandrew/)
    assert.doesNotMatch(html, /Substack-style/)
    assert.doesNotMatch(html, /239,505/)
    assert.doesNotMatch(html, /Mechanism demo, not membership hockey-stick/)
    assert.doesNotMatch(html, /Ghost-class publishing plus HTTP 402/)
  })

  it('returns human 402 headers plus an HTML paywall for a browser', async () => {
    const res = await fetch(`${base}/articles/why-402-not-subscriptions`, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0',
        accept: 'text/html'
      }
    })
    assert.equal(res.status, 402)
    assert.equal(res.headers.get('x-bsv-sats'), '100')
    assert.match(res.headers.get('x-bsv-server') ?? '', /^(02|03)[0-9a-f]{64}$/)
    assert.match(res.headers.get('content-type') ?? '', /text\/html/)
    const html = await res.text()
    assert.ok(html.length > 0)
    assert.match(html, /This essay is 100 sats/)
    assert.match(html, /BSV Browser/)
    assert.match(html, /402-extension/)
    assert.match(html, /BSV Desktop/)
    assert.doesNotMatch(html, /x-bsv-sats/)
    assert.doesNotMatch(html, /x-bsv-server/)
    assert.doesNotMatch(html, /Business case/)
    assert.doesNotMatch(html, /class="business-case"/)
  })

  it('returns a distinct crawler 402 price with a JSON body', async () => {
    const curl = await fetch(`${base}/articles/pay-per-crawl-vs-robots-txt`, {
      headers: { 'user-agent': 'curl/8.7.1' }
    })
    assert.equal(curl.status, 402)
    assert.equal(curl.headers.get('x-bsv-sats'), '500')
    assert.match(curl.headers.get('content-type') ?? '', /application\/json/)
    const curlBody = JSON.parse(await curl.text()) as { status: number; satoshis: number; protocol: string }
    assert.equal(curlBody.status, 402)
    assert.equal(curlBody.satoshis, 500)
    assert.equal(curlBody.protocol, 'BRC-121')

    const json = await fetch(`${base}/articles/how-a-human-or-agent-pays`, {
      headers: {
        'user-agent': 'research-agent/0.1',
        accept: 'application/json'
      }
    })
    assert.equal(json.status, 402)
    assert.equal(json.headers.get('x-bsv-sats'), '500')
    assert.equal(json.headers.get('x-bsv-server'), curl.headers.get('x-bsv-server'))
    assert.match(json.headers.get('content-type') ?? '', /application\/json/)
    const jsonBody = JSON.parse(await json.text()) as { satoshis: number }
    assert.equal(jsonBody.satoshis, 500)
  })

  it('does not charge unknown slugs', async () => {
    const res = await fetch(`${base}/articles/missing`)
    assert.equal(res.status, 404)
    assert.equal(res.headers.get('x-bsv-sats'), null)
  })
})
