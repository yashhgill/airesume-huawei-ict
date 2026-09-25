/** Runtime bindings. On Cloudflare these come from wrangler.toml + secrets;
 *  on the Huawei ECS they come from process.env and the node:sqlite adapter. */
export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  JWT_SECRET?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  LLM_PROVIDER?: string;      // 'groq' (default) | 'mock' (offline tests only)
  RAPIDAPI_KEY?: string;      // optional: JSearch (Google Jobs incl. Malaysia)
  ADMIN_EMAILS?: string;      // comma-separated emails auto-promoted to admin
  APP_RUNTIME?: string;       // 'cloudflare' | 'huawei-ecs'
}

export interface AuthUser { id: string; email: string; role: string; name: string }

export type AppVars = { user: AuthUser };
