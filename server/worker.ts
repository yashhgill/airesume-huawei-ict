/** Cloudflare Workers entry: API under /api, the React app from static assets. */
import app from './app';
import type { Env } from './lib/env';
import { restCaller, SupabaseD1 } from './lib/supabase-d1';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      // Supabase Postgres when configured, otherwise Cloudflare D1
      const DB = env.SUPABASE_URL && env.SUPABASE_KEY && env.PF_DB_SECRET
        ? new SupabaseD1(restCaller(env.SUPABASE_URL, env.SUPABASE_KEY), env.PF_DB_SECRET) as unknown as D1Database
        : env.DB;
      return app.fetch(req, { ...env, DB, APP_RUNTIME: env.APP_RUNTIME ?? (DB === env.DB ? 'cloudflare' : 'cloudflare+supabase') }, ctx);
    }
    return env.ASSETS!.fetch(req); // SPA fallback is handled by assets.not_found_handling
  },
} satisfies ExportedHandler<Env>;
