import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from 'dotenv';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { tools } from './tools.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

config();

const fastify = Fastify();

fastify.register(cors, {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'x-user-id', 'x-session-id'],
});

function createMcpServer(userContext: Record<string, string | undefined>) {
  const server = new McpServer({
    name: 'weatherMcp',
    version: '1.0.0',
  });

  supportedTools.forEach((tool) => {
    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema.shape,
      },
      async (args: Record<string, unknown>) => {
        const results = await tool.handler({ ...args, userContext });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(results) }],
        };
      }
    );
  });

  return server;
}

const supportedTools = tools.filter((tool) => {
  if (!tool.enabled) return false;
  return true;
});

fastify.get('/health', async (_, reply) => {
  reply.code(200).send({ status: 'ok', timestamp: new Date().toISOString() });
});

fastify.get('/mcp', async (_, reply) => {
  reply.code(200).send({
    id: `mcp_list_tools_${Date.now()}`,
    type: 'mcp_list_tools',
    server_label: 'weatherMcp',
    tools: supportedTools.map((tool) => ({
      name: tool.name,
      input_schema: zodToJsonSchema(tool.inputSchema),
    })),
  });
});

fastify.post('/mcp', async (request, reply) => {
  const userContext = {};

  const requestBody = request.body as Record<string, unknown>;
  console.debug('REQUEST:', requestBody);

  if (requestBody.jsonrpc === '2.0') {
    try {
      console.debug('JSON-RPC METHOD:', requestBody.method);

      const server = createMcpServer(userContext);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      reply.raw.on('close', () => {
        console.log('Request closed');
        transport.close();
        server.close();
      });

      reply.raw.setHeader('Content-Type', 'application/json');

      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, requestBody);
      return;
    } catch (error) {
      console.error('MCP server error:', error);
      if (!reply.sent) {
        return reply.code(500).send({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: `Internal error: ${(error as Error).message}`,
          },
          id: null,
        });
      }
    }
  }
});

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== 'test') {
  fastify.listen({ port, host: '0.0.0.0' }, () => {
    console.log(`Server running on port ${port}`);
  });
}

export default fastify;
