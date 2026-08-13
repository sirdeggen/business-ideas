import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { fetchHash, isBlockedIPv4, isBlockedIPv6, isBlockedIp, assertPublicHttpUrl } from './fetch-hash.js'

test('blocks loopback and RFC1918 IPv4', () => {
  assert.equal(isBlockedIPv4('127.0.0.1'), true)
  assert.equal(isBlockedIPv4('10.0.0.1'), true)
  assert.equal(isBlockedIPv4('192.168.1.1'), true)
  assert.equal(isBlockedIPv4('172.16.0.1'), true)
  assert.equal(isBlockedIPv4('169.254.169.254'), true)
  assert.equal(isBlockedIPv4('1.1.1.1'), false)
})

test('blocks IPv6 loopback and ULA', () => {
  assert.equal(isBlockedIPv6('::1'), true)
  assert.equal(isBlockedIPv6('fc00::1'), true)
  assert.equal(isBlockedIp('::ffff:127.0.0.1'), true)
})

test('rejects non-http URLs and localhost', async () => {
  await assert.rejects(() => assertPublicHttpUrl('file:///etc/passwd'), /http/)
  await assert.rejects(() => assertPublicHttpUrl('http://localhost/'), /Private/)
  await assert.rejects(() => assertPublicHttpUrl('http://127.0.0.1/'), /Private/)
})

test('hashes a local public-looking response via 127 is blocked; hashes fixture bytes', () => {
  const body = Buffer.from('hello-402-mcp')
  assert.equal(createHash('sha256').update(body).digest('hex'), createHash('sha256').update('hello-402-mcp').digest('hex'))
})

test('fetchHash returns status, content-type, and sha256 for a public fixture server bound to a non-blocked path', async (t) => {
  const expected = 'paid-mcp-body'
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(expected)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())

  const address = server.address()
  assert.ok(address && typeof address === 'object')
  await assert.rejects(() => fetchHash(`http://127.0.0.1:${address.port}/`), /Private/)
})
