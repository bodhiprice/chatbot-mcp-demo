import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/index.js',
  external: ['@fastify/cors', 'fastify', 'dotenv', '@modelcontextprotocol/sdk', 'zod', 'zod-to-json-schema'],
  target: 'node22',
});
