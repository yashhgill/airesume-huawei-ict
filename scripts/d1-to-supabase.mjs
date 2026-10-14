// Copies all rows from a `wrangler d1 export --no-schema` dump into Supabase through pf_batch.
// usage: SUPABASE_URL=… SUPABASE_KEY=… PF_DB_SECRET=… node scripts/d1-to-supabase.mjs data.sql
import { readFileSync } from 'node:fs';
const { SUPABASE_URL, SUPABASE_KEY, PF_DB_SECRET } = process.env;
if (!SUPABASE_URL || !SUPABASE_KEY || !PF_DB_SECRET) throw new Error('Set SUPABASE_URL, SUPABASE_KEY and PF_DB_SECRET');
const sql = readFileSync(process.argv[2], 'utf8');

// Split into statements on ; outside quotes
const stmts = []; let cur = '', q = false;
for (const ch of sql) { cur += ch; if (ch === "'") q = !q; else if (ch === ';' && !q) { stmts.push(cur.trim()); cur = ''; } }
const SKIP = /^INSERT INTO "?(d1_migrations|sqlite_sequence|_cf_\w+)"?/i;
const inserts = stmts.filter(s => /^INSERT INTO/i.test(s) && !SKIP.test(s)).map(s => s.replace(/;$/, ''));
const tables = [...new Set(inserts.map(s => /^INSERT INTO "?(\w+)"?/i.exec(s)[1]))];
console.log(`${inserts.length} rows across ${tables.length} tables: ${tables.join(', ')}`);

const rpc = async (fn, body) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${SUPABASE_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${await r.text()}`);
  return r.json();
};
// Replace seed data with the real data, then copy row by row in dependency-safe chunks
await rpc('pf_exec', { secret: PF_DB_SECRET, q: `TRUNCATE ${tables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE` });
for (let i = 0; i < inserts.length; i += 200) {
  const chunk = inserts.slice(i, i + 200).map(s => `${s} ON CONFLICT DO NOTHING`);
  await rpc('pf_batch', { secret: PF_DB_SECRET, qs: ['SET LOCAL session_replication_role = replica', ...chunk] }).catch(async e => {
    // fall back to one at a time to report the bad row
    for (const s of chunk) await rpc('pf_exec', { secret: PF_DB_SECRET, q: s }).catch(err => console.error('row failed:', s.slice(0, 160), String(err).slice(0, 200)));
    if (!String(e).includes('session_replication_role')) console.error(String(e).slice(0, 200));
  });
  console.log(`copied ${Math.min(i + 200, inserts.length)}/${inserts.length}`);
}
await rpc('pf_exec', { secret: PF_DB_SECRET, q: 'SELECT pf_fix_sequences()' });
console.log('done');
