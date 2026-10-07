/**
 * University management. One codebase serves many universities; access is
 * scoped by role assignments:
 *
 *   platform admin (users.role = 'admin') → everything, creates universities
 *   uni_admin      (institution_id)       → faculties, staff, insights for one university
 *   faculty_admin  (faculty_id)           → degree programmes, coordinators for one faculty
 *   coordinator    (programme_id)         → PLOs, subjects, CLOs, skills for one programme
 *
 * Each role can only grant roles below it, inside its own scope.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppVars, Env } from './lib/env';
import { hashPassword, newId } from './lib/auth';
import { competency, loadProfile } from './lib/profile';
import { llmJson } from './lib/llm';

type C = Context<{ Bindings: Env; Variables: AppVars }>;
const org = new Hono<{ Bindings: Env; Variables: AppVars }>();

const bad = (msg: string, status: 400 | 403 | 404 | 409 = 400): never => { throw new HTTPException(status, { message: msg }); };
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const list = (v: unknown) => (Array.isArray(v) ? v.map(x => String(x).trim()) : String(v ?? '').split(/\n|;|,(?![^(]*\))/).map(x => x.trim())).filter(Boolean).slice(0, 40);

export type Role = 'uni_admin' | 'faculty_admin' | 'coordinator';
export const ROLE_LABEL: Record<Role, string> = { uni_admin: 'University admin', faculty_admin: 'Faculty admin', coordinator: 'Programme coordinator' };
interface Assignment { id: number; role: Role; institution_id: number | null; faculty_id: number | null; programme_id: number | null }
interface Scope { institution_id: number | null; faculty_id: number | null; programme_id: number | null }

// ── Access control ──────────────────────────────────────────────────────────
async function assignments(c: C): Promise<Assignment[]> {
  const cached = (c as unknown as { _ra?: Assignment[] })._ra;
  if (cached) return cached;
  const r = await c.env.DB.prepare('SELECT id,role,institution_id,faculty_id,programme_id FROM role_assignments WHERE user_id=?').bind(c.get('user').id).all<Assignment>();
  (c as unknown as { _ra?: Assignment[] })._ra = r.results;
  return r.results;
}

/** Fill in the ancestors of a node so a scope check can compare at any level. */
async function resolve(env: Env, s: Partial<Scope>): Promise<Scope> {
  let { institution_id = null, faculty_id = null, programme_id = null } = s;
  if (programme_id && !faculty_id) faculty_id = (await env.DB.prepare('SELECT faculty_id f FROM programmes WHERE id=?').bind(programme_id).first<number>('f')) ?? null;
  if (faculty_id && !institution_id) institution_id = (await env.DB.prepare('SELECT institution_id i FROM faculties WHERE id=?').bind(faculty_id).first<number>('i')) ?? null;
  return { institution_id, faculty_id, programme_id };
}

const isPlatform = (c: C) => c.get('user').role === 'admin';

/** The strongest role the caller holds over this node, or null. */
async function roleOver(c: C, node: Scope): Promise<'platform' | Role | null> {
  if (isPlatform(c)) return 'platform';
  const mine = await assignments(c);
  if (node.institution_id && mine.some(a => a.role === 'uni_admin' && a.institution_id === node.institution_id)) return 'uni_admin';
  if (node.faculty_id && mine.some(a => a.role === 'faculty_admin' && a.faculty_id === node.faculty_id)) return 'faculty_admin';
  if (node.programme_id && mine.some(a => a.role === 'coordinator' && a.programme_id === node.programme_id)) return 'coordinator';
  return null;
}

const RANK = { platform: 4, uni_admin: 3, faculty_admin: 2, coordinator: 1 } as const;
async function need(c: C, s: Partial<Scope>, min: keyof typeof RANK) {
  const node = await resolve(c.env, s);
  const r = await roleOver(c, node);
  if (!r || RANK[r] < RANK[min]) bad('You do not manage this part of the university.', 403);
  return { node, role: r! };
}

async function audit(c: C, s: Partial<Scope>, action: string, detail = '') {
  const n = await resolve(c.env, s);
  await c.env.DB.prepare('INSERT INTO curriculum_log (user_id,programme_id,faculty_id,institution_id,action,detail) VALUES (?,?,?,?,?,?)')
    .bind(c.get('user').id, n.programme_id, n.faculty_id, n.institution_id, action, detail.slice(0, 400)).run();
}

// Only staff or platform admins reach anything below
org.use('*', async (c, next) => {
  if (!isPlatform(c) && !(await assignments(c)).length) bad('This area is for university staff.', 403);
  await next();
});

// ── Who am I and what can I manage ─────────────────────────────────────────
org.get('/me', async c => {
  const mine = await assignments(c);
  const named = await Promise.all(mine.map(async a => {
    const n = await c.env.DB.prepare(`SELECT
      (SELECT name FROM institutions WHERE id=?) institution, (SELECT name FROM faculties WHERE id=?) faculty, (SELECT name FROM programmes WHERE id=?) programme`).bind(a.institution_id, a.faculty_id, a.programme_id).first();
    return { ...a, label: ROLE_LABEL[a.role], ...n };
  }));
  return c.json({ platform: isPlatform(c), assignments: named });
});

/** Everything the caller can see, as a tree, with counts. */
org.get('/tree', async c => {
  const db = c.env.DB;
  const [ins, fac, prog] = await Promise.all([
    db.prepare('SELECT id,name,short_name,city,email_domain,active FROM institutions ORDER BY name').all<{ id: number; name: string }>(),
    db.prepare('SELECT id,institution_id,name,short_name,active FROM faculties ORDER BY name').all<{ id: number; institution_id: number; name: string }>(),
    db.prepare(`SELECT p.id,p.faculty_id,p.name,p.code,p.level,p.mqa_code,p.active,
      (SELECT COUNT(*) FROM subjects s WHERE s.programme_id=p.id) subjects,
      (SELECT COUNT(*) FROM plos x WHERE x.programme_id=p.id) plos,
      (SELECT COUNT(DISTINCT e.user_id) FROM education e WHERE e.programme_id=p.id) students
      FROM programmes p ORDER BY p.name`).all<{ id: number; faculty_id: number; name: string; subjects: number; students: number }>(),
  ]);
  const mine = await assignments(c);
  const all = isPlatform(c);
  const facInst = new Map(fac.results.map(f => [f.id, f.institution_id]));
  const progFac = new Map(prog.results.map(p => [p.id, p.faculty_id]));
  const seeInst = (i: number) => all || mine.some(a => a.institution_id === i || (a.faculty_id && facInst.get(a.faculty_id) === i) || (a.programme_id && facInst.get(progFac.get(a.programme_id)!) === i));
  const seeFac = (f: { id: number; institution_id: number }) => all || mine.some(a => (a.role === 'uni_admin' && a.institution_id === f.institution_id) || a.faculty_id === f.id || (a.programme_id && progFac.get(a.programme_id) === f.id));
  const seeProg = (p: { id: number; faculty_id: number }) => all || mine.some(a => (a.role === 'uni_admin' && a.institution_id === facInst.get(p.faculty_id)) || (a.role === 'faculty_admin' && a.faculty_id === p.faculty_id) || a.programme_id === p.id);
  const can = async (s: Partial<Scope>) => roleOver(c, await resolve(c.env, s));
  const tree = [];
  for (const i of ins.results.filter(x => seeInst(x.id))) {
    const faculties = [];
    for (const f of fac.results.filter(x => x.institution_id === i.id && seeFac(x))) {
      const programmes = [];
      for (const p of prog.results.filter(x => x.faculty_id === f.id && seeProg(x))) programmes.push({ ...p, my: await can({ programme_id: p.id }) });
      faculties.push({ ...f, my: await can({ faculty_id: f.id }), programmes });
    }
    tree.push({ ...i, my: await can({ institution_id: i.id }), faculties });
  }
  return c.json(tree);
});

// ── Universities (platform admin) ──────────────────────────────────────────
org.post('/institutions', async c => {
  if (!isPlatform(c)) bad('Only the platform admin can add a university.', 403);
  const b = await c.req.json();
  if (!str(b.name)) bad('Enter the university name.');
  const r = await c.env.DB.prepare('INSERT INTO institutions (name,short_name,city,email_domain) VALUES (?,?,?,?)').bind(str(b.name, 200), str(b.short_name, 20) || null, str(b.city, 80) || null, str(b.email_domain, 120).toLowerCase() || null).run();
  await audit(c, { institution_id: Number(r.meta.last_row_id) }, 'institution.create', str(b.name));
  return c.json({ id: r.meta.last_row_id }, 201);
});

org.put('/institutions/:id', async c => {
  const id = Number(c.req.param('id'));
  await need(c, { institution_id: id }, 'uni_admin');
  const b = await c.req.json();
  await c.env.DB.prepare('UPDATE institutions SET name=COALESCE(NULLIF(?,\'\'),name), short_name=?, city=?, email_domain=?, active=COALESCE(?,active) WHERE id=?')
    .bind(str(b.name, 200), str(b.short_name, 20) || null, str(b.city, 80) || null, str(b.email_domain, 120).toLowerCase() || null, b.active === undefined ? null : b.active ? 1 : 0, id).run();
  await audit(c, { institution_id: id }, 'institution.update');
  return c.json({ ok: true });
});

// ── Faculties (university admin) ───────────────────────────────────────────
org.post('/faculties', async c => {
  const b = await c.req.json();
  const institution_id = num(b.institution_id);
  if (!institution_id || !str(b.name)) bad('Choose the university and enter the faculty name.');
  await need(c, { institution_id }, 'uni_admin');
  const r = await c.env.DB.prepare('INSERT INTO faculties (institution_id,name,short_name) VALUES (?,?,?)').bind(institution_id, str(b.name, 200), str(b.short_name, 20) || null).run();
  await audit(c, { faculty_id: Number(r.meta.last_row_id) }, 'faculty.create', str(b.name));
  return c.json({ id: r.meta.last_row_id }, 201);
});

org.put('/faculties/:id', async c => {
  const id = Number(c.req.param('id'));
  await need(c, { faculty_id: id }, 'uni_admin');
  const b = await c.req.json();
  await c.env.DB.prepare('UPDATE faculties SET name=COALESCE(NULLIF(?,\'\'),name), short_name=?, active=COALESCE(?,active) WHERE id=?').bind(str(b.name, 200), str(b.short_name, 20) || null, b.active === undefined ? null : b.active ? 1 : 0, id).run();
  await audit(c, { faculty_id: id }, 'faculty.update');
  return c.json({ ok: true });
});

// ── Degree programmes (faculty admin) ──────────────────────────────────────
org.post('/programmes', async c => {
  const b = await c.req.json();
  const faculty_id = num(b.faculty_id);
  if (!faculty_id || !str(b.name)) bad('Choose the faculty and enter the programme name.');
  await need(c, { faculty_id }, 'faculty_admin');
  const r = await c.env.DB.prepare('INSERT INTO programmes (faculty_id,code,name,level,mqa_code,duration_years) VALUES (?,?,?,?,?,?)')
    .bind(faculty_id, str(b.code, 30) || null, str(b.name, 200), str(b.level, 40) || 'Bachelor', str(b.mqa_code, 60) || null, num(b.duration_years) ?? 4).run();
  const pid = Number(r.meta.last_row_id);
  // start from another programme's PLOs (or the platform template) so coordinators edit rather than type 11 outcomes
  const from = num(b.copy_plos_from) ?? (await c.env.DB.prepare('SELECT MIN(programme_id) m FROM plos').first<number>('m'));
  if (from) await c.env.DB.prepare('INSERT INTO plos (programme_id,code,domain,description,sort_order) SELECT ?,code,domain,description,sort_order FROM plos WHERE programme_id=?').bind(pid, from).run();
  await audit(c, { programme_id: pid }, 'programme.create', str(b.name));
  return c.json({ id: pid }, 201);
});

org.put('/programmes/:id', async c => {
  const id = Number(c.req.param('id'));
  await need(c, { programme_id: id }, 'faculty_admin');
  const b = await c.req.json();
  await c.env.DB.prepare('UPDATE programmes SET name=COALESCE(NULLIF(?,\'\'),name), code=?, level=COALESCE(NULLIF(?,\'\'),level), mqa_code=?, duration_years=COALESCE(?,duration_years), active=COALESCE(?,active) WHERE id=?')
    .bind(str(b.name, 200), str(b.code, 30) || null, str(b.level, 40), str(b.mqa_code, 60) || null, num(b.duration_years), b.active === undefined ? null : b.active ? 1 : 0, id).run();
  await audit(c, { programme_id: id }, 'programme.update');
  return c.json({ ok: true });
});

// ── Curriculum for one programme (coordinator) ─────────────────────────────
org.get('/programmes/:id', async c => {
  const id = Number(c.req.param('id'));
  const { role } = await need(c, { programme_id: id }, 'coordinator');
  const db = c.env.DB;
  const p = await db.prepare('SELECT p.*, f.name faculty, f.id faculty_id, i.name institution, i.id institution_id FROM programmes p JOIN faculties f ON f.id=p.faculty_id JOIN institutions i ON i.id=f.institution_id WHERE p.id=?').bind(id).first();
  if (!p) bad('Programme not found.', 404);
  const [plos, subjects, log] = await Promise.all([
    db.prepare('SELECT id,code,domain,description,sort_order FROM plos WHERE programme_id=? ORDER BY sort_order,code').bind(id).all(),
    db.prepare('SELECT id,code,name,year,semester,credits,clos,plo_codes,skills FROM subjects WHERE programme_id=? ORDER BY year,semester,name').bind(id).all<Record<string, string>>(),
    db.prepare('SELECT l.action,l.detail,l.created_at,u.name FROM curriculum_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.programme_id=? ORDER BY l.id DESC LIMIT 25').bind(id).all(),
  ]);
  return c.json({
    programme: p, my: role, plos: plos.results, log: log.results,
    subjects: subjects.results.map(s => ({ ...s, clos: JSON.parse(s.clos || '[]'), plo_codes: JSON.parse(s.plo_codes || '[]'), skills: JSON.parse(s.skills || '[]') })),
  });
});

org.post('/programmes/:id/plos', async c => {
  const id = Number(c.req.param('id'));
  await need(c, { programme_id: id }, 'coordinator');
  const b = await c.req.json();
  if (!str(b.code) || !str(b.description)) bad('A PLO needs a code and a description.');
  const order = (await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order),-1)+1 n FROM plos WHERE programme_id=?').bind(id).first<number>('n')) ?? 0;
  const r = await c.env.DB.prepare('INSERT INTO plos (programme_id,code,domain,description,sort_order) VALUES (?,?,?,?,?)').bind(id, str(b.code, 20), str(b.domain, 60) || null, str(b.description, 600), order).run();
  await audit(c, { programme_id: id }, 'plo.create', str(b.code));
  return c.json({ id: r.meta.last_row_id }, 201);
});

async function ploProgramme(c: C) {
  const pid = await c.env.DB.prepare('SELECT programme_id p FROM plos WHERE id=?').bind(Number(c.req.param('id'))).first<number>('p');
  if (!pid) bad('PLO not found.', 404);
  await need(c, { programme_id: pid! }, 'coordinator');
  return pid!;
}

org.put('/plos/:id', async c => {
  const pid = await ploProgramme(c);
  const b = await c.req.json();
  const old = await c.env.DB.prepare('SELECT code FROM plos WHERE id=?').bind(Number(c.req.param('id'))).first<string>('code');
  const code = str(b.code, 20) || old!;
  await c.env.DB.prepare('UPDATE plos SET code=?, domain=?, description=COALESCE(NULLIF(?,\'\'),description) WHERE id=?').bind(code, str(b.domain, 60) || null, str(b.description, 600), Number(c.req.param('id'))).run();
  if (code !== old) {   // keep subject mappings pointing at the renamed code
    const subs = await c.env.DB.prepare('SELECT id,plo_codes FROM subjects WHERE programme_id=?').bind(pid).all<{ id: number; plo_codes: string }>();
    for (const s of subs.results) {
      const codes: string[] = JSON.parse(s.plo_codes || '[]');
      if (codes.includes(old!)) await c.env.DB.prepare('UPDATE subjects SET plo_codes=? WHERE id=?').bind(JSON.stringify(codes.map(x => (x === old ? code : x))), s.id).run();
    }
  }
  await audit(c, { programme_id: pid }, 'plo.update', code);
  return c.json({ ok: true });
});

org.delete('/plos/:id', async c => {
  const pid = await ploProgramme(c);
  const code = await c.env.DB.prepare('SELECT code FROM plos WHERE id=?').bind(Number(c.req.param('id'))).first<string>('code');
  await c.env.DB.prepare('DELETE FROM plos WHERE id=?').bind(Number(c.req.param('id'))).run();
  await audit(c, { programme_id: pid }, 'plo.delete', code ?? '');
  return c.json({ ok: true });
});

const subjectArgs = (b: Record<string, unknown>) => [str(b.code, 20) || null, str(b.name, 160), num(b.year), num(b.semester), num(b.credits), JSON.stringify(list(b.clos)), JSON.stringify(list(b.plo_codes).map(x => x.toUpperCase().replace(/\s+/g, ''))), JSON.stringify(list(b.skills))];

org.post('/programmes/:id/subjects', async c => {
  const id = Number(c.req.param('id'));
  await need(c, { programme_id: id }, 'coordinator');
  const b = await c.req.json();
  if (!str(b.name)) bad('Enter the subject name.');
  const r = await c.env.DB.prepare("INSERT INTO subjects (programme_id,code,name,year,semester,credits,clos,plo_codes,skills,updated_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))").bind(id, ...subjectArgs(b)).run();
  await audit(c, { programme_id: id }, 'subject.create', `${str(b.code)} ${str(b.name)}`);
  return c.json({ id: r.meta.last_row_id }, 201);
});

/** Bulk import: one row per subject. Columns: code, name, year, semester, credits, clos, plos, skills (lists separated by ;) */
org.post('/programmes/:id/subjects/import', async c => {
  const id = Number(c.req.param('id'));
  await need(c, { programme_id: id }, 'coordinator');
  const b = await c.req.json();
  const rows: Record<string, unknown>[] = Array.isArray(b.rows) ? b.rows.slice(0, 300) : [];
  if (!rows.length) bad('No subjects found in the file.');
  const replace = !!b.replace;
  const existing = new Map((await c.env.DB.prepare('SELECT id,lower(COALESCE(code,name)) k FROM subjects WHERE programme_id=?').bind(id).all<{ id: number; k: string }>()).results.map(r => [r.k, r.id]));
  const stmts = [];
  let added = 0, updated = 0;
  for (const r of rows) {
    if (!str(r.name)) continue;
    const key = (str(r.code) || str(r.name)).toLowerCase();
    const hit = existing.get(key);
    if (hit) { updated++; stmts.push(c.env.DB.prepare("UPDATE subjects SET code=?,name=?,year=?,semester=?,credits=?,clos=?,plo_codes=?,skills=?,updated_at=datetime('now') WHERE id=?").bind(...subjectArgs(r), hit)); }
    else { added++; stmts.push(c.env.DB.prepare("INSERT INTO subjects (programme_id,code,name,year,semester,credits,clos,plo_codes,skills,updated_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'))").bind(id, ...subjectArgs(r))); }
  }
  if (replace) {
    const keep = new Set(rows.map(r => (str(r.code) || str(r.name)).toLowerCase()));
    for (const [k, sid] of existing) if (!keep.has(k)) stmts.push(c.env.DB.prepare('DELETE FROM subjects WHERE id=?').bind(sid));
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  await audit(c, { programme_id: id }, 'subject.import', `${added} added, ${updated} updated`);
  return c.json({ added, updated });
});

async function subjectProgramme(c: C) {
  const pid = await c.env.DB.prepare('SELECT programme_id p FROM subjects WHERE id=?').bind(Number(c.req.param('id'))).first<number>('p');
  if (!pid) bad('Subject not found.', 404);
  await need(c, { programme_id: pid! }, 'coordinator');
  return pid!;
}

org.put('/subjects/:id', async c => {
  const pid = await subjectProgramme(c);
  const b = await c.req.json();
  if (!str(b.name)) bad('Enter the subject name.');
  await c.env.DB.prepare("UPDATE subjects SET code=?,name=?,year=?,semester=?,credits=?,clos=?,plo_codes=?,skills=?,updated_at=datetime('now') WHERE id=?").bind(...subjectArgs(b), Number(c.req.param('id'))).run();
  await audit(c, { programme_id: pid }, 'subject.update', `${str(b.code)} ${str(b.name)}`);
  return c.json({ ok: true });
});

org.delete('/subjects/:id', async c => {
  const pid = await subjectProgramme(c);
  const n = await c.env.DB.prepare('SELECT name FROM subjects WHERE id=?').bind(Number(c.req.param('id'))).first<string>('name');
  await c.env.DB.prepare('DELETE FROM subjects WHERE id=?').bind(Number(c.req.param('id'))).run();
  await audit(c, { programme_id: pid }, 'subject.delete', n ?? '');
  return c.json({ ok: true });
});

/** AI assist: given a subject's CLOs, suggest which PLOs it supports and the industry skills it builds. */
org.post('/programmes/:id/ai-map', async c => {
  const id = Number(c.req.param('id'));
  await need(c, { programme_id: id }, 'coordinator');
  const b = await c.req.json();
  const clos = list(b.clos);
  if (!str(b.name) || !clos.length) bad('Enter the subject name and at least one CLO first.');
  const plos = (await c.env.DB.prepare('SELECT code,domain,description FROM plos WHERE programme_id=? ORDER BY sort_order').bind(id).all<{ code: string; domain: string; description: string }>()).results;
  const out = await llmJson<{ plo_codes: string[]; skills: string[]; notes: string }>(c.env, {
    task: 'map_subject', input: { plos, clos }, temperature: 0.2,
    system: 'You are a Malaysian outcome-based education (OBE) curriculum specialist. Map course learning outcomes to programme learning outcomes conservatively: only map a PLO when a CLO clearly assesses it. Skills must be concrete, employer-searchable terms (tools, technologies, methods), not vague phrases.',
    user: `Programme learning outcomes:\n${plos.map(p => `${p.code} (${p.domain}): ${p.description}`).join('\n')}\n\nSubject: ${str(b.name)}\nCourse learning outcomes:\n${clos.map((x, i) => `CLO${i + 1}: ${x}`).join('\n')}\n\nReturn {"plo_codes":["PLO codes this subject supports, 1-4"],"skills":["4-8 concrete skills"],"notes":"one sentence on why"}`,
  });
  const valid = new Set(plos.map(p => p.code));
  return c.json({ plo_codes: (out.plo_codes ?? []).filter(x => valid.has(x)), skills: (out.skills ?? []).slice(0, 10), notes: out.notes ?? '' });
});

// ── Staff ───────────────────────────────────────────────────────────────────
/** Which roles the caller may grant at this node. */
function grantable(my: keyof typeof RANK, target: 'institution' | 'faculty' | 'programme'): Role[] {
  if (target === 'institution') return RANK[my] >= RANK.platform ? ['uni_admin'] : RANK[my] >= RANK.uni_admin ? ['uni_admin'] : [];
  if (target === 'faculty') return RANK[my] >= RANK.uni_admin ? ['faculty_admin'] : [];
  return RANK[my] >= RANK.faculty_admin ? ['coordinator'] : [];
}

org.get('/staff', async c => {
  const scope = { institution_id: num(c.req.query('institution_id')), faculty_id: num(c.req.query('faculty_id')), programme_id: num(c.req.query('programme_id')) };
  const { node, role } = await need(c, scope, 'coordinator');
  // everyone assigned at this node or below it
  const r = await c.env.DB.prepare(`SELECT ra.id, ra.role, ra.institution_id, ra.faculty_id, ra.programme_id, u.id user_id, u.name, u.email, u.must_change_password pending,
      f.name faculty, p.name programme
    FROM role_assignments ra JOIN users u ON u.id=ra.user_id
    LEFT JOIN faculties f ON f.id=COALESCE(ra.faculty_id,(SELECT faculty_id FROM programmes WHERE id=ra.programme_id))
    LEFT JOIN programmes p ON p.id=ra.programme_id
    WHERE (? IS NOT NULL AND ra.programme_id=?)
       OR (? IS NULL AND ? IS NOT NULL AND (ra.faculty_id=? OR ra.programme_id IN (SELECT id FROM programmes WHERE faculty_id=?)))
       OR (? IS NULL AND ? IS NULL AND (ra.institution_id=? OR ra.faculty_id IN (SELECT id FROM faculties WHERE institution_id=?) OR ra.programme_id IN (SELECT p.id FROM programmes p JOIN faculties f ON f.id=p.faculty_id WHERE f.institution_id=?)))
    ORDER BY ra.role, u.name`)
    .bind(scope.programme_id, scope.programme_id, scope.programme_id, scope.faculty_id, scope.faculty_id, scope.faculty_id, scope.programme_id, scope.faculty_id, node.institution_id, node.institution_id, node.institution_id).all();
  const target = scope.programme_id ? 'programme' : scope.faculty_id ? 'faculty' : 'institution';
  return c.json({ staff: r.results.map(x => ({ ...x, label: ROLE_LABEL[(x as { role: Role }).role] })), can_grant: grantable(role, target), my: role });
});

org.post('/staff', async c => {
  const b = await c.req.json();
  const role = b.role as Role;
  const scope = { institution_id: num(b.institution_id), faculty_id: num(b.faculty_id), programme_id: num(b.programme_id) };
  const target = scope.programme_id ? 'programme' : scope.faculty_id ? 'faculty' : 'institution';
  const need_ = role === 'coordinator' ? 'faculty_admin' : role === 'faculty_admin' ? 'uni_admin' : 'uni_admin';
  const { node, role: my } = await need(c, scope, need_);
  if (!grantable(my, target).includes(role)) bad(`You cannot appoint a ${ROLE_LABEL[role] ?? role} here.`, 403);
  if ((role === 'coordinator' && !scope.programme_id) || (role === 'faculty_admin' && !scope.faculty_id) || (role === 'uni_admin' && !scope.institution_id)) bad('Pick where this person will work.');
  const name = str(b.name, 120), email = str(b.email, 160).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad('Enter a valid email address.');
  let user = await c.env.DB.prepare('SELECT id,role FROM users WHERE email=?').bind(email).first<{ id: string; role: string }>();
  let password: string | null = null;
  if (!user) {
    if (!name) bad('Enter their name.');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    password = Array.from(crypto.getRandomValues(new Uint8Array(12)), n => alphabet[n % alphabet.length]).join('');
    const id = newId();
    await c.env.DB.prepare("INSERT INTO users (id,name,email,password_hash,role,must_change_password) VALUES (?,?,?,?,'staff',1)").bind(id, name, email, await hashPassword(password)).run();
    user = { id, role: 'staff' };
  } else if (user.role === 'student') {
    await c.env.DB.prepare("UPDATE users SET role='staff' WHERE id=?").bind(user.id).run();
  }
  const exists = await c.env.DB.prepare('SELECT 1 FROM role_assignments WHERE user_id=? AND role=? AND COALESCE(institution_id,0)=? AND COALESCE(faculty_id,0)=? AND COALESCE(programme_id,0)=?')
    .bind(user.id, role, role === 'uni_admin' ? node.institution_id : 0, role === 'faculty_admin' ? node.faculty_id : 0, role === 'coordinator' ? node.programme_id : 0).first();
  if (exists) bad('This person already has that role here.', 409);
  await c.env.DB.prepare('INSERT INTO role_assignments (user_id,role,institution_id,faculty_id,programme_id,created_by) VALUES (?,?,?,?,?,?)')
    .bind(user.id, role, role === 'uni_admin' ? node.institution_id : null, role === 'faculty_admin' ? node.faculty_id : null, role === 'coordinator' ? node.programme_id : null, c.get('user').id).run();
  await audit(c, node, 'staff.add', `${ROLE_LABEL[role]}: ${email}`);
  return c.json({ email, password, existing: !password }, 201);
});

org.delete('/staff/:id', async c => {
  const a = await c.env.DB.prepare('SELECT * FROM role_assignments WHERE id=?').bind(Number(c.req.param('id'))).first<Assignment & { user_id: string }>();
  if (!a) bad('Not found.', 404);
  const min = a!.role === 'coordinator' ? 'faculty_admin' : 'uni_admin';
  const { node } = await need(c, a!, min);
  if (a!.user_id === c.get('user').id && !isPlatform(c)) bad('You cannot remove your own role. Ask the admin above you.', 403);
  await c.env.DB.prepare('DELETE FROM role_assignments WHERE id=?').bind(a!.id).run();
  const left = await c.env.DB.prepare('SELECT COUNT(*) n FROM role_assignments WHERE user_id=?').bind(a!.user_id).first<number>('n');
  if (!left) await c.env.DB.prepare("UPDATE users SET role='student' WHERE id=? AND role='staff'").bind(a!.user_id).run();
  await audit(c, node, 'staff.remove', ROLE_LABEL[a!.role]);
  return c.json({ ok: true });
});

// ── Insights: how ready are our students? ──────────────────────────────────
org.get('/insights', async c => {
  const scope = { institution_id: num(c.req.query('institution_id')), faculty_id: num(c.req.query('faculty_id')), programme_id: num(c.req.query('programme_id')) };
  const { node } = await need(c, scope, 'coordinator');
  const progIds = scope.programme_id ? [scope.programme_id]
    : scope.faculty_id ? (await c.env.DB.prepare('SELECT id FROM programmes WHERE faculty_id=?').bind(scope.faculty_id).all<{ id: number }>()).results.map(r => r.id)
      : (await c.env.DB.prepare('SELECT p.id FROM programmes p JOIN faculties f ON f.id=p.faculty_id WHERE f.institution_id=?').bind(node.institution_id).all<{ id: number }>()).results.map(r => r.id);
  if (!progIds.length) return c.json({ students: 0, avgReadiness: null, sharing: 0, withResume: 0, withInterview: 0, plos: [], topSkills: [], gaps: [], byProgramme: [] });
  const marks = progIds.map(() => '?').join(',');
  const studs = (await c.env.DB.prepare(`SELECT DISTINCT e.user_id id, e.programme_id pid FROM education e JOIN users u ON u.id=e.user_id WHERE e.programme_id IN (${marks}) AND u.role='student' LIMIT 500`).bind(...progIds).all<{ id: string; pid: number }>()).results;
  const plo = new Map<string, { code: string; domain: string; sum: number; n: number }>();
  const skills = new Map<string, number>();
  const byProg = new Map<number, { sum: number; n: number }>();
  let sumR = 0, sharing = 0;
  for (const s of studs) {
    const p = await loadProfile(c.env, s.id);
    const comp = await competency(c.env, p);
    sumR += comp.readiness;
    if (p.user.share_profile) sharing++;
    const bp = byProg.get(s.pid) ?? { sum: 0, n: 0 }; bp.sum += comp.readiness; bp.n++; byProg.set(s.pid, bp);
    for (const x of comp.plos) { const k = `${x.code}`; const e = plo.get(k) ?? { code: x.code, domain: x.domain, sum: 0, n: 0 }; e.sum += x.strength; e.n++; plo.set(k, e); }
    for (const k of p.skills) skills.set(k.name, (skills.get(k.name) ?? 0) + 1);
  }
  const ids = studs.map(s => s.id);
  const im = ids.map(() => '?').join(',') || "''";
  const [withResume, withInterview] = ids.length ? await Promise.all([
    c.env.DB.prepare(`SELECT COUNT(DISTINCT user_id) n FROM resumes WHERE user_id IN (${im})`).bind(...ids).first<number>('n'),
    c.env.DB.prepare(`SELECT COUNT(DISTINCT user_id) n FROM interviews WHERE user_id IN (${im}) AND score IS NOT NULL`).bind(...ids).first<number>('n'),
  ]) : [0, 0];
  const names = new Map((await c.env.DB.prepare(`SELECT id,name FROM programmes WHERE id IN (${marks})`).bind(...progIds).all<{ id: number; name: string }>()).results.map(r => [r.id, r.name]));
  const plos = [...plo.values()].map(x => ({ code: x.code, domain: x.domain, avg: Math.round(x.sum / x.n) })).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  return c.json({
    students: studs.length, avgReadiness: studs.length ? Math.round(sumR / studs.length) : null, sharing, withResume: withResume ?? 0, withInterview: withInterview ?? 0,
    plos, gaps: [...plos].sort((a, b) => a.avg - b.avg).slice(0, 3),
    topSkills: [...skills].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, n]) => ({ name, n })),
    byProgramme: [...byProg].map(([id, v]) => ({ id, name: names.get(id), students: v.n, avgReadiness: Math.round(v.sum / v.n) })).sort((a, b) => b.students - a.students),
  });
});

org.get('/log', async c => {
  const scope = { institution_id: num(c.req.query('institution_id')), faculty_id: num(c.req.query('faculty_id')), programme_id: num(c.req.query('programme_id')) };
  const { node } = await need(c, scope, 'coordinator');
  const col = scope.programme_id ? 'programme_id' : scope.faculty_id ? 'faculty_id' : 'institution_id';
  const val = scope.programme_id ?? scope.faculty_id ?? node.institution_id;
  const r = await c.env.DB.prepare(`SELECT l.action,l.detail,l.created_at,u.name FROM curriculum_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.${col}=? ORDER BY l.id DESC LIMIT 50`).bind(val).all();
  return c.json(r.results);
});

export default org;
