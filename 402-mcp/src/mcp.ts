import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import { PRICE_SATS } from './config.js'
import { fetchHash } from './fetch-hash.js'

export const MCP_NAME = '402-mcp'
export const MCP_VERSION = '0.1.0'

export function createPaidMcpServer(): McpServer {
  const server = new McpServer({ name: MCP_NAME, version: MCP_VERSION })

  server.registerTool(
    'fetch_hash',
    {
      description:
        `GET a public URL and return SHA-256 of the body plus HTTP status and content-type. ` +
        `Each call costs ${PRICE_SATS} sats via BRC-121 (x-bsv-* headers). No API key.`,
      inputSchema: z.object({
        url: z.string().describe('Public http(s) URL to fetch')
      })
    },
    async ({ url }) => {
      try {
        const result = await fetchHash(url)
        return { content: [{ type: 'text', text: JSON.stringify(result) }] }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
          isError: true
        }
      }
    }
  )

  return server
}

export const mcpHandler = createMcpHandler(() => createPaidMcpServer(), { legacy: 'stateless' })
