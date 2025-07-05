import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/index.js',
  external: [
    '@fastify/cors',
    'fastify', 
    'dotenv',
    '@anthropic-ai/sdk',
    '@modelcontextprotocol/sdk',
    'fastify-sse-v2'
  ],
  target: 'node22'
});