import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mcpHandler } from './mcp.js'
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  MCP_PROTOCOL_VERSION,
  PROTOCOL_VERSION_META_KEY,
  mcpRequestBody,
  mcpRequestHeaders
} from './mcp-request.js'

test('mcpRequestBody always includes the 2026-07-28 _meta envelope', () => {
  const listed = mcpRequestBody('tools/list')
  assert.equal(listed.method, 'tools/list')
  assert.ok(listed.params._meta && typeof listed.params._meta === 'object')
  const meta = listed.params._meta as Record<string, unknown>
  assert.equal(meta[PROTOCOL_VERSION_META_KEY], MCP_PROTOCOL_VERSION)
  assert.deepEqual(meta[CLIENT_CAPABILITIES_META_KEY], {})
  assert.equal((meta[CLIENT_INFO_META_KEY] as { name: string }).name, '402-mcp-pay')

  const called = mcpRequestBody('tools/call', { name: 'fetch_hash', arguments: { url: 'https://example.com' } })
  assert.equal(called.params.name, 'fetch_hash')
  assert.ok(called.params._meta)
})

test('tools/list with _meta returns 200 from the MCP handler without a wallet', async () => {
  const res = await mcpHandler.fetch(
    new Request('http://127.0.0.1/mcp', {
      method: 'POST',
      headers: mcpRequestHeaders('tools/list'),
      body: JSON.stringify(mcpRequestBody('tools/list'))
    })
  )
  assert.equal(res.status, 200)
  const text = await res.text()
  assert.match(text, /fetch_hash/)
})

test('tools/list with modern header but no _meta is 400', async () => {
  const res = await mcpHandler.fetch(
    new Request('http://127.0.0.1/mcp', {
      method: 'POST',
      headers: mcpRequestHeaders('tools/list'),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    })
  )
  assert.equal(res.status, 400)
  const text = await res.text()
  assert.match(text, /_meta/)
})
