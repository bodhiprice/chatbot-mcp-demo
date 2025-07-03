import Fastify from 'fastify';
import cors from '@fastify/cors';
import { FastifySSEPlugin } from 'fastify-sse-v2';
import { config } from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

config();

const fastify = Fastify({
  logger: true
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
    const stream = anthropic.messages
      .stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: userMessage
          }
        ]
      })
      .on('text', (text) => {
        reply.sse({
          event: 'text',
          data: JSON.stringify({ text })
        });
      })
      .on('contentBlock', (block) => {
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
  fastify.listen({ port, host }, (err, address) => {
    if (err) {
      fastify.log.error(err);
      process.exit(1);
    }
    fastify.log.info(`Server listening at ${address}`);
  });
}

export default fastify;