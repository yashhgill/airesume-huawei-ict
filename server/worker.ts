/** Cloudflare Workers entry: API under /api, the React app from static assets. */
import app from './app';
import type { Env } from './lib/env';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) return app.fetch(req, { ...env, APP_RUNTIME: env.APP_RUNTIME ?? 'cloudflare' }, ctx);
    return env.ASSETS!.fetch(req); // SPA fallback is handled by assets.not_found_handling
  },
} satisfies ExportedHandler<Env>;
