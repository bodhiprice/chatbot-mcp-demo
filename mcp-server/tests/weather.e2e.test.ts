import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fastify from '../src/index.js';

describe('Weather MCP Server E2E Tests', () => {
  beforeAll(async () => {
    await fastify.ready();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('should return health status', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.status).toBe('ok');
    expect(data.timestamp).toBeDefined();
  });

  it('should list available tools', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/mcp',
    });

    expect(response.statusCode).toBe(200);
    const data = JSON.parse(response.payload);
    expect(data.tools).toHaveLength(3);
    expect(data.tools.map((t: { name: string }) => t.name)).toEqual([
      'get_current_weather',
      'get_weather_forecast',
      'get_weather_alerts',
    ]);
  });

  it('should get current weather for NYC', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      payload: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_current_weather',
          arguments: {
            location: '40.7128,-74.0060',
          },
        },
        id: 1,
      }),
    });

    expect(response.statusCode).toBe(200);

    const sseLines = response.payload.split('\n');
    const dataLine = sseLines.find((line) => line.startsWith('data: '));
    const jsonData = JSON.parse(dataLine!.substring(6));
    const weatherText = JSON.parse(jsonData.result.content[0].text);

    expect(weatherText).toContain('Current conditions for 40.7128,-74.006');
  });

  it('should get weather forecast for Chicago', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      payload: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_weather_forecast',
          arguments: {
            location: '41.8781,-87.6298',
            days: 3,
          },
        },
        id: 2,
      }),
    });

    expect(response.statusCode).toBe(200);

    const sseLines = response.payload.split('\n');
    const dataLine = sseLines.find((line) => line.startsWith('data: '));
    const jsonData = JSON.parse(dataLine!.substring(6));
    const forecastText = JSON.parse(jsonData.result.content[0].text);

    expect(forecastText).toContain('3-day forecast for 41.8781,-87.6298');
  });

  it('should handle invalid coordinates', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/mcp',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      payload: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: 'get_current_weather',
          arguments: {
            location: 'New York City',
          },
        },
        id: 3,
      }),
    });

    console.debug('RESPONSE', response.payload);

    expect(response.statusCode).toBe(200);

    const sseLines = response.payload.split('\n');
    const dataLine = sseLines.find((line) => line.startsWith('data: '));
    const jsonData = JSON.parse(dataLine!.substring(6));
    const errorText = JSON.parse(jsonData.result.content[0].text);

    expect(errorText).toContain('Error: Location must be in lat,lon format');
  });
});
