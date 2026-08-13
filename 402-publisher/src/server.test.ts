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
  })

  it('returns human 402 headers for a browser', async () => {
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
  })

  it('returns a distinct crawler 402 price for curl and JSON Accept', async () => {
    const curl = await fetch(`${base}/articles/pay-per-crawl-vs-robots-txt`, {
      headers: { 'user-agent': 'curl/8.7.1' }
    })
    assert.equal(curl.status, 402)
    assert.equal(curl.headers.get('x-bsv-sats'), '500')

    const json = await fetch(`${base}/articles/how-a-human-or-agent-pays`, {
      headers: {
        'user-agent': 'research-agent/0.1',
        accept: 'application/json'
      }
    })
    assert.equal(json.status, 402)
    assert.equal(json.headers.get('x-bsv-sats'), '500')
    assert.equal(json.headers.get('x-bsv-server'), curl.headers.get('x-bsv-server'))
  })

  it('does not charge unknown slugs', async () => {
    const res = await fetch(`${base}/articles/missing`)
    assert.equal(res.status, 404)
    assert.equal(res.headers.get('x-bsv-sats'), null)
  })
})
