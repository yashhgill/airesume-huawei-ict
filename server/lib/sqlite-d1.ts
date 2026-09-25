/**
 * A small D1-compatible wrapper over Node's built-in `node:sqlite`, so the exact
 * same route code runs on Cloudflare (D1) and on a Huawei Cloud ECS (SQLite file).
 * Only the subset of the D1 API that this app uses is implemented.
 */
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

type Param = string | number | null | bigint | Uint8Array;

class Stmt {
  params: Param[] = [];
  constructor(private db: DatabaseSync, readonly sql: string) {}
  bind(...p: unknown[]) {
    this.params = p.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)) as Param[];
    return this;
  }
  async all<T = Record<string, unknown>>() {
    const results = this.db.prepare(this.sql).all(...this.params) as T[];
    return { results, success: true, meta: {} };
  }
  async first<T = Record<string, unknown>>(col?: string) {
    const row = this.db.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (col ? row[col] : row) as T;
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  runSync() { return this.db.prepare(this.sql).run(...this.params); }
}

export class SqliteD1 {
  private db: DatabaseSync;
  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  }
  prepare(sql: string) { return new Stmt(this.db, sql); }
  async batch(stmts: Stmt[]) {
    this.db.exec('BEGIN');
    try {
      const out = stmts.map(s => { const r = s.runSync(); return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; });
      this.db.exec('COMMIT');
      return out;
    } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  async exec(sql: string) { this.db.exec(sql); return { count: 0, duration: 0 }; }

  /** Apply migrations/*.sql once each, like `wrangler d1 migrations apply`. */
  migrate(dir: string) {
    this.db.exec('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT DEFAULT (datetime(\'now\')))');
    const done = new Set((this.db.prepare('SELECT name FROM d1_migrations').all() as { name: string }[]).map(r => r.name));
    for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      this.db.exec('BEGIN');
      try {
        this.db.exec(readFileSync(join(dir, f), 'utf8'));
        this.db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(f);
        this.db.exec('COMMIT');
        console.log(`[db] applied ${f}`);
      } catch (e) { this.db.exec('ROLLBACK'); throw e; }
    }
  }
}
