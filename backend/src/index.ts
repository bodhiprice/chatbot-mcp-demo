import Fastify from 'fastify';
import cors from '@fastify/cors';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import { config } from 'dotenv';
import { join } from 'path';
import Anthropic from '@anthropic-ai/sdk';

config({ path: join(process.cwd(), '..', '.env') });

const fastify = Fastify({
  logger: true,
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

fastify.register(cors, {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
});

fastify.register(FastifySSEPlugin);

fastify.get('/health', async (_, reply) => {
  reply.code(200).send({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'chatbot-backend',
  });
});

fastify.get('/chat/stream', async (request, reply) => {
  const { message: userMessage } = request.query as Record<string, string>;

  if (!userMessage) {
    return reply.code(400).send({ error: 'Message parameter required' });
  }

  reply.sse({
    event: 'connected',
    data: JSON.stringify({ status: 'connected' }),
  });

  try {
    const stream = anthropic.beta.messages
      .stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
        ...(process.env.MCP_SERVER_URL && process.env.MCP_SERVER_URL.trim() !== ''
          ? {
              betas: ['mcp-client-2025-04-04'],
              mcp_servers: [
                {
                  type: 'url',
                  url: `${process.env.MCP_SERVER_URL}/mcp`,
                  name: 'weather-mcp',
                },
              ],
            }
          : {}),
      })
      .on('text', (textDelta: string, textSnapshot: string) => {
        console.log('TEXT DELTA:', textDelta);
        reply.sse({
          event: 'text',
          data: JSON.stringify({ text: textDelta, snapshot: textSnapshot }),
        });
      })
      .on('contentBlock', (contentBlock: object) => {
        console.log('CONTENT BLOCK:', contentBlock);
        reply.sse({
          event: 'contentBlock',
          data: JSON.stringify(contentBlock),
        });
      })
      .on('message', (message: object) => {
        console.log('MESSAGE:', message);
        reply.sse({
          event: 'message',
          data: JSON.stringify(message),
        });
      })
      .on('error', (error: Error) => {
        console.error('STREAM ERROR:', error);
        reply.sse({
          event: 'error',
          data: JSON.stringify({ error: error.message }),
        });
      })
      .on('end', () => {
        console.log('STREAM END');
        reply.sse({
          event: 'done',
          data: JSON.stringify({ status: 'completed' }),
        });
      });

    await stream.finalMessage();
  } catch (error) {
    console.error('CATCH ERROR:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    reply.sse({
      event: 'error',
      data: JSON.stringify({ error: errorMessage }),
    });
  }
});

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';

if (process.env.NODE_ENV !== 'test') {
  fastify.listen({ port, host }, (err, address) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    fastify.log.info(`Server listening at ${address}`);
  });
}

export default fastify;
