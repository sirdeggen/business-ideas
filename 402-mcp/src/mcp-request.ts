/** MCP 2026-07-28 per-request envelope. Required when MCP-Protocol-Version is set. */
export const MCP_PROTOCOL_VERSION = '2026-07-28'

export const PROTOCOL_VERSION_META_KEY = 'io.modelcontextprotocol/protocolVersion'
export const CLIENT_CAPABILITIES_META_KEY = 'io.modelcontextprotocol/clientCapabilities'
export const CLIENT_INFO_META_KEY = 'io.modelcontextprotocol/clientInfo'

export function mcpRequestMeta(): Record<string, unknown> {
  return {
    [PROTOCOL_VERSION_META_KEY]: MCP_PROTOCOL_VERSION,
    [CLIENT_CAPABILITIES_META_KEY]: {},
    [CLIENT_INFO_META_KEY]: { name: '402-mcp-pay', version: '0.1.0' }
  }
}

export function mcpRequestHeaders(method: string, name?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    'Mcp-Method': method
  }
  if (name) headers['Mcp-Name'] = name
  return headers
}

export function mcpRequestBody(
  method: string,
  params?: Record<string, unknown>,
  id: number | string = 1
): { jsonrpc: '2.0'; id: number | string; method: string; params: Record<string, unknown> } {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params: {
      ...(params ?? {}),
      _meta: mcpRequestMeta()
    }
  }
}
