import Fastify from 'fastify';
import cors from '@fastify/cors';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import { config } from 'dotenv';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';
import { Client } from '@modelcontextprotocol/sdk/client/index';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

config({ path: join(process.cwd(), '..', '.env') });

const fastify = Fastify({
  logger: true
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

let mcpClient: Client | null = null;
let mcpTools: unknown[] = [];

async function initializeMcpClient() {
  const mcpServerUrl = process.env.MCP_SERVER_URL;
  if (!mcpServerUrl) {
    fastify.log.info('MCP_SERVER_URL not found, skipping MCP client initialization');
    return;
  }

  try {
    const transport = new StreamableHTTPClientTransport(new URL(mcpServerUrl));
    mcpClient = new Client(
      {
        name: 'chatbot-backend',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    await mcpClient.connect(transport);
    fastify.log.info(`Connected to MCP server at ${mcpServerUrl}`);

    const toolsResponse = await mcpClient.listTools();

    console.debug('TOOLS:', toolsResponse);

    if (toolsResponse.tools) {
      mcpTools = toolsResponse.tools.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.inputSchema as Record<string, unknown>
        }
      }));
      fastify.log.info(`Loaded ${mcpTools.length} MCP tools`);
    }
  } catch (error) {
    fastify.log.error('Failed to initialize MCP client:', error);
  }
}

fastify.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS']
});

fastify.register(FastifySSEPlugin);

fastify.get('/health', async (_, reply) => {
  reply.code(200).send({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'chatbot-backend'
  });
});

fastify.get('/chat/stream', async (request, reply) => {
  const { message: userMessage } = request.query as Record<string, string>;

  if (!userMessage) {
    return reply.code(400).send({ error: 'Message parameter required' });
  }

  reply.sse({
    event: 'connected',
    data: JSON.stringify({ status: 'connected' })
  });

  try {
    const streamParams: Anthropic.MessageCreateParams = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: userMessage
        }
      ]
    };

    if (mcpTools.length > 0) {
      streamParams.tools = mcpTools as Anthropic.MessageCreateParamsStreaming['tools'];
    }

    const stream = anthropic.messages
      .stream(streamParams)
      .on('text', (text) => {
        reply.sse({
          event: 'text',
          data: JSON.stringify({ text })
        });
      })
      .on('contentBlock', (block) => {
        console.debug('CONTENT BLOCK:', block);
        reply.sse({
          event: 'contentBlock',
          data: JSON.stringify(block)
        });
      });
    await stream.finalMessage();

    reply.sse({
      event: 'done',
      data: JSON.stringify({ status: 'completed' })
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    reply.sse({
      event: 'error',
      data: JSON.stringify({ error: errorMessage })
    });
  }
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

if (process.env.NODE_ENV !== 'test') {
  fastify.listen({ port, host }, async (err, address) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    fastify.log.info(`Server listening at ${address}`);
    await initializeMcpClient();
  });
}

export default fastify;
