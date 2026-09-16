import { createServer, type Server } from 'node:http'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Services } from '../services'
import { createMcpServer } from './tools'

export const MCP_PORT = Number(process.env.CANVASCL_MCP_PORT ?? 3845)

/** Stateless Streamable-HTTP MCP endpoint bound to localhost only. */
export function startHttpMcp(api: Services, version: string): Promise<{ url: string; server: Server } | null> {
  const http = createServer(async (req, res) => {
    if (!req.url?.startsWith('/mcp')) {
      res.writeHead(404).end()
      return
    }
    // DNS-rebinding guard: only accept local origins
    const origin = req.headers.origin
    if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.writeHead(403).end('Forbidden origin')
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' }).end()
      return
    }
    try {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')
      const server = createMcpServer(api, version)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      res.on('close', () => {
        void transport.close()
        void server.close()
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch (err) {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: String(err) }, id: null }))
    }
  })
  return new Promise((resolve) => {
    http.once('error', () => resolve(null))
    http.listen(MCP_PORT, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${MCP_PORT}/mcp`, server: http }))
  })
}

export async function startStdioMcp(api: Services, version: string): Promise<void> {
  const server = createMcpServer(api, version)
  await server.connect(new StdioServerTransport())
}
