import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Request } from 'express'
import { isPaidToolCall, mcpMethodOf } from './payment.js'

function req(partial: { headers?: Record<string, string>; body?: unknown }): Request {
  return { headers: partial.headers ?? {}, body: partial.body } as Request
}

test('mcpMethodOf prefers Mcp-Method header', () => {
  assert.equal(
    mcpMethodOf(req({ headers: { 'mcp-method': 'tools/call' }, body: { method: 'tools/list' } })),
    'tools/call'
  )
})

test('mcpMethodOf falls back to JSON-RPC method', () => {
  assert.equal(mcpMethodOf(req({ body: { jsonrpc: '2.0', method: 'tools/list' } })), 'tools/list')
})

test('only tools/call is paid', () => {
  assert.equal(isPaidToolCall(req({ body: { method: 'initialize' } })), false)
  assert.equal(isPaidToolCall(req({ body: { method: 'tools/list' } })), false)
  assert.equal(isPaidToolCall(req({ body: { method: 'tools/call' } })), true)
  assert.equal(isPaidToolCall(req({ headers: { 'mcp-method': 'tools/call' } })), true)
})
