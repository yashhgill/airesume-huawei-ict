/**
 * D1-compatible wrapper over Supabase Postgres, so the same route code runs on
 * Cloudflare D1, node:sqlite (Huawei ECS) and Supabase. Statements go through two
 * SECURITY DEFINER functions (pf_exec / pf_batch, see supabase/functions.sql) over
 * the REST API, guarded by a shared secret. Parameters are inlined as escaped
 * SQL literals, and the few SQLite-only forms the app uses are translated.
 */
type Param = string | number | null;

export interface PgCaller { (fn: 'pf_exec' | 'pf_batch', body: Record<string, unknown>): Promise<unknown> }

export function restCaller(url: string, key: string): PgCaller {
  return async (fn, body) => {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    if (!r.ok) {
      let msg = text;
      try { const j = JSON.parse(text) as { message?: string; details?: string }; msg = [j.message, j.details].filter(Boolean).join(' — '); } catch { /* raw */ }
      throw new Error(`DB: ${msg.slice(0, 300)}`);
    }
    return JSON.parse(text);
  };
}

const lit = (v: unknown): string => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number' || typeof v === 'bigint') return Number.isFinite(Number(v)) ? String(v) : 'NULL';
  return `'${String(v).replace(/\u0000/g, '').replace(/'/g, "''")}'`;
};

/** Replace ? placeholders (outside quoted strings) with literals and translate SQLite-only syntax. */
export function compile(sql: string, params: Param[]): string {
  let out = '', i = 0, q: string | null = null;
  for (const ch of sql) {
    if (q) { out += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; out += ch; continue; }
    if (ch === '?') { out += lit(params[i++]); continue; }
    out += ch;
  }
  out = out.trim().replace(/;\s*$/, '');
  if (/^insert\s+or\s+ignore\s+into/i.test(out)) {
    out = out.replace(/^insert\s+or\s+ignore\s+into/i, 'INSERT INTO');
    out = /\sreturning\s/i.test(out) ? out.replace(/(\sreturning\s)/i, ' ON CONFLICT DO NOTHING$1') : `${out} ON CONFLICT DO NOTHING`;
  }
  if (/^insert\s/i.test(out) && !/\sreturning\s/i.test(out)) out += ' RETURNING *';
  return out;
}

type Res = { rows: Record<string, unknown>[]; changes: number };
const norm = (rows: Record<string, unknown>[]) => rows.map(r => {
  for (const k in r) if (typeof r[k] === 'boolean') r[k] = r[k] ? 1 : 0; // SQLite returns 0/1
  return r;
});
const meta = (r: Res) => ({ changes: r.changes, last_row_id: Number((r.rows[0] as { id?: unknown } | undefined)?.id) || 0 });

class Stmt {
  params: Param[] = [];
  constructor(private db: SupabaseD1, readonly sql: string) {}
  bind(...p: unknown[]) { this.params = p.map(v => (v === undefined ? null : v)) as Param[]; return this; }
  text() { return compile(this.sql, this.params); }
  async all<T = Record<string, unknown>>() { const r = await this.db.exec1(this.text()); return { results: norm(r.rows) as T[], success: true, meta: meta(r) }; }
  async first<T = Record<string, unknown>>(col?: string) {
    const r = await this.db.exec1(this.text());
    const row = norm(r.rows)[0];
    if (!row) return null;
    return (col ? row[col] ?? null : row) as T;
  }
  async run() { const r = await this.db.exec1(this.text()); return { success: true, results: [], meta: meta(r) }; }
}

export class SupabaseD1 {
  constructor(private call: PgCaller, private secret: string) {}
  prepare(sql: string) { return new Stmt(this, sql); }
  async exec1(q: string): Promise<Res> { return await this.call('pf_exec', { secret: this.secret, q }) as Res; }
  async batch(stmts: Stmt[]) {
    if (!stmts.length) return [];
    const out = await this.call('pf_batch', { secret: this.secret, qs: stmts.map(s => s.text()) }) as Res[];
    return out.map(r => ({ success: true, results: norm(r.rows), meta: meta(r) }));
  }
  async exec(sql: string) { await this.exec1(sql); return { count: 0, duration: 0 }; }
}
