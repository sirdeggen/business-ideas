import { createMcpHandler, McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import { PRICE_SATS } from './config.js'
import { extractArticle } from './extract-article.js'

export const MCP_NAME = '402-mcp'
export const MCP_VERSION = '0.1.0'
export const PAID_TOOL = 'extract_article'

export function createPaidMcpServer(): McpServer {
  const server = new McpServer({ name: MCP_NAME, version: MCP_VERSION })

  server.registerTool(
    PAID_TOOL,
    {
      description:
        `Extract the main article text from a public URL (readable prose, not raw HTML). ` +
        `Each call costs ${PRICE_SATS} sats via BRC-121. No API key — the wallet is the account.`,
      inputSchema: z.object({
        url: z.string().describe('Public http(s) URL of the article to extract')
      })
    },
    async ({ url }) => {
      try {
        const result = await extractArticle(url)
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
