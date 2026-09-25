/**
 * Node entry for Huawei Cloud ECS (or any VM): same Hono app, SQLite file
 * instead of D1, serves the built React app from ./dist.
 */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import app from './app';
import { SqliteD1 } from './lib/sqlite-d1';
import type { Env } from './lib/env';

const root = process.cwd();
const db = new SqliteD1(process.env.DB_PATH ?? resolve(root, 'data/airesume.db'));
db.migrate(resolve(root, 'migrations'));

const env = {
  DB: db as unknown as D1Database,
  JWT_SECRET: process.env.JWT_SECRET,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  GROQ_MODEL: process.env.GROQ_MODEL,
  LLM_PROVIDER: process.env.LLM_PROVIDER,
  RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  APP_RUNTIME: process.env.APP_RUNTIME ?? 'huawei-ecs',
} satisfies Env;

if (!env.JWT_SECRET) console.warn('[warn] JWT_SECRET is not set; using an insecure development secret.');

const server = new Hono();
server.route('/', new Hono().all('/api/*', c => app.fetch(c.req.raw, env)));
const dist = resolve(root, 'dist');
if (existsSync(dist)) {
  const indexHtml = readFileSync(resolve(dist, 'index.html'), 'utf8');
  server.use('/*', serveStatic({ root: './dist' }));
  server.get('*', c => c.html(indexHtml));
}

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: server.fetch, port, hostname: process.env.HOST ?? '0.0.0.0' }, i => console.log(`AI Resume API on http://localhost:${i.port} (${env.APP_RUNTIME})`));
