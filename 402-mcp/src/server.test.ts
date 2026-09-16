import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'
import { createApp } from './server.js'

describe('402 MCP routes', () => {
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

  it('keeps GET / free HTML with the Business case and no wallet', async () => {
    const res = await fetch(`${base}/`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /text\/html/)
    const html = await res.text()
    assert.match(html, /<h2 id="business-case-heading">Business case<\/h2>/)
    assert.match(html, /Why it exists/)
    assert.match(html, /Who pays/)
    assert.match(html, /Market signal/)
    assert.match(html, /Proof people pay/)
    assert.match(html, /Demo goal/)
    assert.match(html, /POST \/mcp/)
    assert.doesNotMatch(html, /Margaret/)
    assert.doesNotMatch(html, /## Sources/)
  })
})
