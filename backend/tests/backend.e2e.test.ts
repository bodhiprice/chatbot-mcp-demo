import { describe, it, expect } from 'vitest';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(process.cwd(), '..', '.env') });

describe('Backend E2E Tests', () => {
  const baseUrl = process.env.BACKEND_URL;

  it('should return health status', async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.service).toBe('chatbot-backend');
    expect(data.timestamp).toBeDefined();
  });

  it('should return 400 for missing message parameter', async () => {
    const response = await fetch(`${baseUrl}/chat/stream`);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe('Message parameter required');
  });

  it('should stream response for "What is the capital of Florida?" and contain "Tallahassee"', async () => {
    const response = await fetch(`${baseUrl}/chat/stream?message=What+is+the+capital+of+Florida%3F`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          fullText += chunk;

          if (chunk.includes('event: done')) {
            break;
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    expect(fullText.toLowerCase()).toContain('tallahassee');
  });
});
