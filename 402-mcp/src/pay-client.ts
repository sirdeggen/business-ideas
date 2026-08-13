import { WalletClient } from '@bsv/sdk'
import { create402Fetch } from '@bsv/402-pay/client'

const MCP_URL = process.env.MCP_URL || 'http://127.0.0.1:3000/mcp'
const ORIGINATOR = process.env.ORIGINATOR || 'http://127.0.0.1:3000'
const DEFAULT_URL = 'https://example.com'

function argValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]
  return fallback
}

function mcpHeaders(method: string, name?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'Mcp-Protocol-Version': '2026-07-28',
    'Mcp-Method': method
  }
  if (name) headers['Mcp-Name'] = name
  return headers
}

async function readMcpResponse(res: Response): Promise<unknown> {
  const contentType = res.headers.get('content-type') ?? ''
  const text = await res.text()
  if (contentType.includes('text/event-stream')) {
    const dataLines = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
    const last = dataLines.at(-1)
    if (!last) return { raw: text }
    try {
      return JSON.parse(last)
    } catch {
      return { raw: text }
    }
  }
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

async function mcpPost(
  fetchImpl: FetchLike,
  method: string,
  params: Record<string, unknown> | undefined,
  name?: string
): Promise<{ status: number; headers: Headers; body: unknown }> {
  const res = await fetchImpl(MCP_URL, {
    method: 'POST',
    headers: mcpHeaders(method, name),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      ...(params ? { params } : {})
    })
  })
  return { status: res.status, headers: res.headers, body: await readMcpResponse(res) }
}

async function main(): Promise<void> {
  const targetUrl = argValue('--url', process.env.FETCH_URL || DEFAULT_URL)
  const probeOnly = process.argv.includes('--probe')

  console.log(`MCP: ${MCP_URL}`)
  console.log(`tool: fetch_hash url=${targetUrl}`)

  if (probeOnly) {
    const unpaid = await mcpPost(fetch, 'tools/call', { name: 'fetch_hash', arguments: { url: targetUrl } }, 'fetch_hash')
    console.log(`unpaid tools/call -> ${unpaid.status}`)
    console.log(`x-bsv-sats: ${unpaid.headers.get('x-bsv-sats')}`)
    console.log(`x-bsv-server: ${unpaid.headers.get('x-bsv-server')}`)
    if (unpaid.status !== 402) {
      console.log(JSON.stringify(unpaid.body, null, 2))
      process.exit(1)
    }
    return
  }

  const wallet = new WalletClient('auto', ORIGINATOR)
  await wallet.getVersion({})
  const { publicKey } = await wallet.getPublicKey({ identityKey: true })
  console.log(`wallet identity: ${publicKey}`)
  console.log('Approve the spend in BSV Desktop / Gebunden if prompted.')

  const fetch402 = create402Fetch({ wallet, cacheTimeoutMs: 0 })

  const listed = await mcpPost(fetch, 'tools/list', undefined)
  console.log(`tools/list (free) -> ${listed.status}`)
  console.log(JSON.stringify(listed.body, null, 2))

  const paid = await mcpPost(
    fetch402,
    'tools/call',
    { name: 'fetch_hash', arguments: { url: targetUrl } },
    'fetch_hash'
  )
  console.log(`tools/call (paid) -> ${paid.status}`)
  console.log(JSON.stringify(paid.body, null, 2))
  if (paid.status !== 200) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
