import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppVars, Env } from './lib/env';
import { hashPassword, newId, signJwt, verifyJwt, verifyPassword } from './lib/auth';
import { competency, loadProfile } from './lib/profile';
import { coachSystem, gradeAnswer, interviewQuestions, learningPlan, type PlanContent } from './lib/ai';
import { atsReview, careerInsights, coverLetter, generateResume, inferSkills, jobFit, parseResumeText, type JobLite, type ResumeContent } from './lib/ai';
import { LlmError, llmStream } from './lib/llm';
import { searchJobs } from './lib/jobs';
import org from './org';
import { extractKeywords, quickMatch, skillInText } from './lib/text';

type C = Context<{ Bindings: Env; Variables: AppVars }>;
const app = new Hono<{ Bindings: Env; Variables: AppVars }>().basePath('/api');

const secret = (env: Env) => env.JWT_SECRET || 'dev-only-secret-change-me';
const bad = (msg: string, status: 400 | 401 | 403 | 404 | 409 = 400) => { throw new HTTPException(status, { message: msg }); };
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

async function log(c: C, action: string, detail = '', ok = true, started?: number) {
  try {
    await c.env.DB.prepare('INSERT INTO activity (user_id,action,detail,ok,ms) VALUES (?,?,?,?,?)')
      .bind(c.get('user')?.id ?? null, action, detail.slice(0, 300), ok ? 1 : 0, started ? Date.now() - started : null).run();
  } catch { /* logging must never break a request */ }
}

/** Run an AI task with timing + activity logging. */
async function ai<T>(c: C, action: string, fn: () => Promise<T>, detail = ''): Promise<T> {
  const t = Date.now();
  try { const r = await fn(); await log(c, action, detail, true, t); return r; }
  catch (e) { await log(c, action, `${detail} ${(e as Error).message}`, false, t); throw e; }
}

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  if (err instanceof LlmError) return c.json({ error: err.message }, err.status as 502);
  console.error(err);
  return c.json({ error: 'Something went wrong on our side.' }, 500);
});

// ── Health ──────────────────────────────────────────────────────────────────
app.get('/health', async c => {
  const users = await c.env.DB.prepare('SELECT COUNT(*) n FROM users').first<number>('n');
  return c.json({ ok: true, runtime: c.env.APP_RUNTIME ?? 'cloudflare', ai: c.env.LLM_PROVIDER === 'mock' ? 'mock' : c.env.GROQ_API_KEY ? 'groq' : 'not configured', jobs: c.env.RAPIDAPI_KEY ? ['JSearch', 'Remotive', 'Arbeitnow'] : ['Remotive', 'Arbeitnow'], users, linkedin: !!(c.env.LINKEDIN_CLIENT_ID && c.env.LINKEDIN_CLIENT_SECRET), time: new Date().toISOString() });
});

// ── Auth ────────────────────────────────────────────────────────────────────
function isAdminEmail(env: Env, email: string) {
  return (env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

app.post('/auth/register', async c => {
  const b = await c.req.json().catch(() => ({}));
  const name = str(b.name, 120), email = str(b.email, 160).toLowerCase(), password = typeof b.password === 'string' ? b.password : '';
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad('Enter your name and a valid email.');
  if (password.length < 8) bad('Password must be at least 8 characters.');
  if (await c.env.DB.prepare('SELECT 1 FROM users WHERE email=?').bind(email).first()) bad('An account with this email already exists. Sign in instead.', 409);
  const id = newId();
  const role = isAdminEmail(c.env, email) ? 'admin' : 'student';
  await c.env.DB.prepare('INSERT INTO users (id,name,email,password_hash,role) VALUES (?,?,?,?,?)').bind(id, name, email, await hashPassword(password), role).run();
  const token = await signJwt({ sub: id, email, role, name }, secret(c.env));
  await c.env.DB.prepare('INSERT INTO activity (user_id,action) VALUES (?,?)').bind(id, 'register').run();
  return c.json({ token, user: { id, name, email, role } }, 201);
});

app.post('/auth/login', async c => {
  const b = await c.req.json().catch(() => ({}));
  const email = str(b.email, 160).toLowerCase();
  const row = await c.env.DB.prepare('SELECT id,name,email,role,password_hash,must_change_password FROM users WHERE email=?').bind(email).first<{ id: string; name: string; email: string; role: string; password_hash: string; must_change_password: number }>();
  if (!row || !(await verifyPassword(String(b.password ?? ''), row.password_hash))) bad('Email or password is incorrect.', 401);
  let role = row!.role;
  if (role !== 'admin' && isAdminEmail(c.env, email)) { role = 'admin'; await c.env.DB.prepare("UPDATE users SET role='admin' WHERE id=?").bind(row!.id).run(); }
  const token = await signJwt({ sub: row!.id, email, role, name: row!.name }, secret(c.env));
  await c.env.DB.prepare('INSERT INTO activity (user_id,action) VALUES (?,?)').bind(row!.id, 'login').run();
  return c.json({ token, user: { id: row!.id, name: row!.name, email, role }, mustChangePassword: !!row!.must_change_password });
});


// ── Sign in with LinkedIn (OpenID Connect) ─────────────────────────────────
// LinkedIn only shares name, email and photo with apps outside its partner
// programme. Certifications, positions and skills come from the member's own
// data export, imported in Profile → Import.
const LI_AUTH = 'https://www.linkedin.com/oauth/v2/authorization';
const LI_TOKEN = 'https://www.linkedin.com/oauth/v2/accessToken';
const LI_USERINFO = 'https://api.linkedin.com/v2/userinfo';
const liRedirect = (c: C) => `${new URL(c.req.url).origin}/api/auth/linkedin/callback`;

app.get('/auth/linkedin', async c => {
  if (!c.env.LINKEDIN_CLIENT_ID || !c.env.LINKEDIN_CLIENT_SECRET) bad('LinkedIn sign-in is not configured.', 404);
  const link = c.req.query('link');   // a signed-in user's token, to connect LinkedIn to an existing account
  const linkUser = link ? await verifyJwt<{ sub: string }>(link, secret(c.env)) : null;
  const state = await signJwt({ k: 'li', link: linkUser?.sub ?? null }, secret(c.env), 600);
  const u = new URL(LI_AUTH);
  u.search = new URLSearchParams({ response_type: 'code', client_id: c.env.LINKEDIN_CLIENT_ID!, redirect_uri: liRedirect(c), scope: 'openid profile email', state }).toString();
  return c.redirect(u.toString());
});

app.get('/auth/linkedin/callback', async c => {
  const fail = (m: string) => c.redirect(`/auth/linkedin#error=${encodeURIComponent(m)}`);
  const st = await verifyJwt<{ k: string; link: string | null }>(c.req.query('state') ?? '', secret(c.env));
  if (!st || st.k !== 'li') return fail('Sign-in expired. Please try again.');
  const code = c.req.query('code');
  if (!code) return fail(c.req.query('error_description') ?? 'LinkedIn sign-in was cancelled.');
  const tr = await fetch(LI_TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: liRedirect(c), client_id: c.env.LINKEDIN_CLIENT_ID ?? '', client_secret: c.env.LINKEDIN_CLIENT_SECRET ?? '' }) });
  if (!tr.ok) return fail('LinkedIn did not accept the sign-in.');
  const { access_token } = await tr.json() as { access_token: string };
  const ui = await (await fetch(LI_USERINFO, { headers: { authorization: `Bearer ${access_token}` } })).json() as { sub: string; name?: string; email?: string; email_verified?: boolean; picture?: string };
  if (!ui.sub) return fail('Could not read your LinkedIn profile.');
  const db = c.env.DB;
  type U = { id: string; name: string; email: string; role: string };
  let user: U | null = null;
  if (st.link) {
    await db.prepare('UPDATE users SET linkedin_sub=?, avatar_url=COALESCE(?,avatar_url) WHERE id=?').bind(ui.sub, ui.picture ?? null, st.link).run();
    user = await db.prepare('SELECT id,name,email,role FROM users WHERE id=?').bind(st.link).first<U>();
  }
  user ??= await db.prepare('SELECT id,name,email,role FROM users WHERE linkedin_sub=?').bind(ui.sub).first<U>();
  if (!user && ui.email && ui.email_verified !== false) {
    user = await db.prepare('SELECT id,name,email,role FROM users WHERE email=?').bind(ui.email.toLowerCase()).first<U>();
    if (user) await db.prepare('UPDATE users SET linkedin_sub=?, avatar_url=COALESCE(?,avatar_url) WHERE id=?').bind(ui.sub, ui.picture ?? null, user.id).run();
  }
  let fresh = false;
  if (!user) {
    if (!ui.email) return fail('Your LinkedIn account has no email we can use.');
    const id = newId(), email = ui.email.toLowerCase(), name = ui.name || email.split('@')[0];
    const role = isAdminEmail(c.env, email) ? 'admin' : 'student';
    await db.prepare('INSERT INTO users (id,name,email,password_hash,role,linkedin_sub,avatar_url) VALUES (?,?,?,?,?,?,?)')
      .bind(id, name, email, await hashPassword(crypto.randomUUID()), role, ui.sub, ui.picture ?? null).run();
    user = { id, name, email, role }; fresh = true;
  }
  await db.prepare('INSERT INTO activity (user_id,action) VALUES (?,?)').bind(user!.id, fresh ? 'register.linkedin' : 'login.linkedin').run();
  const token = await signJwt({ sub: user!.id, email: user!.email, role: user!.role, name: user!.name }, secret(c.env));
  return c.redirect(`/auth/linkedin#token=${token}&new=${fresh ? 1 : 0}&linked=${st.link ? 1 : 0}`);
});

// ── Auth middleware for everything below ────────────────────────────────────
const requireUser = async (c: C, next: Next) => {
  const h = c.req.header('authorization') ?? '';
  const payload = h.startsWith('Bearer ') ? await verifyJwt<{ sub: string; email: string; role: string; name: string }>(h.slice(7), secret(c.env)) : null;
  if (!payload) bad('Please sign in again.', 401);
  c.set('user', { id: payload!.sub, email: payload!.email, role: payload!.role, name: payload!.name });
  await next();
};
const requireAdmin = async (c: C, next: Next) => {
  if (c.get('user').role !== 'admin') bad('Admins only.', 403);
  await next();
};

const requireRecruiter = async (c: C, next: Next) => {
  if (!['recruiter', 'admin'].includes(c.get('user').role)) bad('Recruiters only.', 403);
  await next();
};

// ── Catalogue (public) ──────────────────────────────────────────────────────
app.get('/catalog', async c => {
  const [inst, fac, prog] = await Promise.all([
    c.env.DB.prepare('SELECT id,name,short_name,city,email_domain FROM institutions WHERE active=1 ORDER BY name').all(),
    c.env.DB.prepare('SELECT id,institution_id,name,short_name FROM faculties WHERE active=1 ORDER BY name').all(),
    c.env.DB.prepare('SELECT p.id,p.faculty_id,p.name,p.level,(SELECT COUNT(*) FROM subjects s WHERE s.programme_id=p.id) subjects FROM programmes p WHERE p.active=1 ORDER BY p.name').all(),
  ]);
  return c.json({ institutions: inst.results, faculties: fac.results, programmes: prog.results });
});

app.get('/catalog/programmes/:id', async c => {
  const id = Number(c.req.param('id'));
  const prog = await c.env.DB.prepare('SELECT p.*, f.name faculty, i.name institution FROM programmes p JOIN faculties f ON f.id=p.faculty_id JOIN institutions i ON i.id=f.institution_id WHERE p.id=?').bind(id).first();
  if (!prog) bad('Programme not found.', 404);
  const [plos, subjects] = await Promise.all([
    c.env.DB.prepare('SELECT id,code,domain,description FROM plos WHERE programme_id=? ORDER BY sort_order').bind(id).all(),
    c.env.DB.prepare('SELECT id,code,name,year,clos,plo_codes,skills FROM subjects WHERE programme_id=? ORDER BY year,name').bind(id).all<Record<string, string>>(),
  ]);
  return c.json({ programme: prog, plos: plos.results, subjects: subjects.results.map(s => ({ ...s, clos: JSON.parse(s.clos || '[]'), plo_codes: JSON.parse(s.plo_codes || '[]'), skills: JSON.parse(s.skills || '[]') })) });
});

app.use('/org/*', requireUser);
app.use('/me', requireUser);
app.use('/me/*', requireUser);
app.use('/talent', requireUser, requireRecruiter);
app.use('/talent/*', requireUser, requireRecruiter);
app.use('/profile/*', requireUser);
app.use('/profile', requireUser);
app.use('/ai/*', requireUser);
app.use('/resumes/*', requireUser);
app.use('/resumes', requireUser);
app.use('/jobs/*', requireUser);
app.use('/admin/*', requireUser, requireAdmin);

// ── Profile ─────────────────────────────────────────────────────────────────
app.get('/me', async c => c.json(await loadProfile(c.env, c.get('user').id)));

app.put('/me', async c => {
  const b = await c.req.json();
  await c.env.DB.prepare('UPDATE users SET name=?,phone=?,location=?,headline=?,linkedin=?,github=?,website=? WHERE id=?')
    .bind(str(b.name, 120) || c.get('user').name, str(b.phone, 40), str(b.location, 120), str(b.headline, 160), str(b.linkedin, 200), str(b.github, 200), str(b.website, 200), c.get('user').id).run();
  return c.json(await loadProfile(c.env, c.get('user').id));
});

app.put('/me/sharing', async c => {
  const b = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare('UPDATE users SET share_profile=? WHERE id=?').bind(b.share ? 1 : 0, c.get('user').id).run();
  await log(c, b.share ? 'sharing.on' : 'sharing.off');
  return c.json({ ok: true, share: !!b.share });
});

app.put('/me/password', async c => {
  const b = await c.req.json().catch(() => ({}));
  const next = typeof b.next === 'string' ? b.next : '';
  if (next.length < 8) bad('New password must be at least 8 characters.');
  const row = await c.env.DB.prepare('SELECT password_hash,must_change_password FROM users WHERE id=?').bind(c.get('user').id).first<{ password_hash: string; must_change_password: number }>();
  if (!row!.must_change_password && !(await verifyPassword(String(b.current ?? ''), row!.password_hash))) bad('Your current password is incorrect.', 401);
  await c.env.DB.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?').bind(await hashPassword(next), c.get('user').id).run();
  return c.json({ ok: true });
});

app.get('/profile/competency', async c => {
  const p = await loadProfile(c.env, c.get('user').id);
  return c.json(await competency(c.env, p));
});

app.post('/profile/education', async c => {
  const b = await c.req.json();
  const uid = c.get('user').id;
  let institution = str(b.institution, 200), qualification = str(b.qualification, 200);
  const programmeId = num(b.programme_id);
  if (programmeId) {
    const p = await c.env.DB.prepare('SELECT p.name, i.name inst FROM programmes p JOIN faculties f ON f.id=p.faculty_id JOIN institutions i ON i.id=f.institution_id WHERE p.id=?').bind(programmeId).first<{ name: string; inst: string }>();
    if (p) { institution ||= p.inst; qualification ||= p.name; }
  }
  if (!institution || !qualification) bad('Institution and qualification are required.');
  const r = await c.env.DB.prepare('INSERT INTO education (user_id,programme_id,institution,qualification,start_year,end_year,cgpa,notes) VALUES (?,?,?,?,?,?,?,?)')
    .bind(uid, programmeId, institution, qualification, num(b.start_year), num(b.end_year), num(b.cgpa), str(b.notes, 400)).run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

app.delete('/profile/education/:id', async c => {
  await c.env.DB.prepare('DELETE FROM education WHERE id=? AND user_id=?').bind(Number(c.req.param('id')), c.get('user').id).run();
  return c.json({ ok: true });
});

app.put('/profile/subjects', async c => {
  const b = await c.req.json();
  const ids: number[] = Array.isArray(b.subject_ids) ? b.subject_ids.map(Number).filter(Number.isFinite).slice(0, 200) : [];
  const uid = c.get('user').id;
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM user_subjects WHERE user_id=?').bind(uid),
    ...ids.map(id => c.env.DB.prepare('INSERT OR IGNORE INTO user_subjects (user_id,subject_id) VALUES (?,?)').bind(uid, id)),
  ]);
  return c.json({ ok: true, count: ids.length });
});

app.post('/profile/skills', async c => {
  const b = await c.req.json();
  const list = (Array.isArray(b.skills) ? b.skills : [b]).slice(0, 60);
  const uid = c.get('user').id;
  const stmts = list.filter((s: Record<string, unknown>) => str(s?.name, 80)).map((s: Record<string, unknown>) =>
    c.env.DB.prepare('INSERT INTO skills (user_id,name,category,level,source,evidence) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,name) DO UPDATE SET category=excluded.category, level=excluded.level, evidence=COALESCE(excluded.evidence, skills.evidence)')
      .bind(uid, str(s.name, 80), str(s.category, 30) || 'Technical', Math.max(1, Math.min(5, Number(s.level) || 3)), str(s.source, 20) || 'manual', str(s.evidence, 200) || null));
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ ok: true, added: stmts.length });
});

app.delete('/profile/skills/:id', async c => {
  await c.env.DB.prepare('DELETE FROM skills WHERE id=? AND user_id=?').bind(Number(c.req.param('id')), c.get('user').id).run();
  return c.json({ ok: true });
});

app.post('/profile/experiences', async c => {
  const b = await c.req.json();
  if (!str(b.title)) bad('Give the role or project a title.');
  const r = await c.env.DB.prepare('INSERT INTO experiences (user_id,kind,title,organisation,start_date,end_date,description) VALUES (?,?,?,?,?,?,?)')
    .bind(c.get('user').id, ['work', 'internship', 'project', 'activity'].includes(b.kind) ? b.kind : 'work', str(b.title, 160), str(b.organisation, 160), str(b.start_date, 20), str(b.end_date, 20), str(b.description, 2000)).run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

app.put('/profile/experiences/:id', async c => {
  const b = await c.req.json();
  await c.env.DB.prepare('UPDATE experiences SET kind=?,title=?,organisation=?,start_date=?,end_date=?,description=? WHERE id=? AND user_id=?')
    .bind(b.kind, str(b.title, 160), str(b.organisation, 160), str(b.start_date, 20), str(b.end_date, 20), str(b.description, 2000), Number(c.req.param('id')), c.get('user').id).run();
  return c.json({ ok: true });
});

app.delete('/profile/experiences/:id', async c => {
  await c.env.DB.prepare('DELETE FROM experiences WHERE id=? AND user_id=?').bind(Number(c.req.param('id')), c.get('user').id).run();
  return c.json({ ok: true });
});

app.post('/profile/certifications', async c => {
  const b = await c.req.json();
  if (!str(b.name)) bad('Certification name is required.');
  const r = await c.env.DB.prepare('INSERT INTO certifications (user_id,name,issuer,year,url) VALUES (?,?,?,?,?)').bind(c.get('user').id, str(b.name, 160), str(b.issuer, 120), str(b.year, 10), str(b.url, 300)).run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

app.delete('/profile/certifications/:id', async c => {
  await c.env.DB.prepare('DELETE FROM certifications WHERE id=? AND user_id=?').bind(Number(c.req.param('id')), c.get('user').id).run();
  return c.json({ ok: true });
});

/** Skills straight from the curriculum: no AI needed, fully traceable. */
app.post('/profile/skills/from-subjects', async c => {
  const p = await loadProfile(c.env, c.get('user').id);
  const found = new Map<string, string[]>();
  for (const s of p.subjects) for (const k of s.skills) found.set(k, [...(found.get(k) ?? []), s.name]);
  const have = new Set(p.skills.map(s => s.name.toLowerCase()));
  const fresh = [...found].filter(([k]) => !have.has(k.toLowerCase()));
  if (fresh.length) {
    await c.env.DB.batch(fresh.map(([name, subs]) => c.env.DB.prepare('INSERT OR IGNORE INTO skills (user_id,name,category,level,source,evidence) VALUES (?,?,?,?,?,?)')
      .bind(p.user.id, name, 'Technical', Math.min(4, 2 + subs.length), 'subject', subs.join(', '))));
  }
  return c.json({ added: fresh.length, skills: fresh.map(([name, subs]) => ({ name, evidence: subs })) });
});

// ── AI features ─────────────────────────────────────────────────────────────
app.post('/ai/skills', async c => {
  const p = await loadProfile(c.env, c.get('user').id);
  if (!p.subjects.length && !p.experiences.length) bad('Add subjects or experience first so the AI has something to work from.');
  const r = await ai(c, 'ai.skills', () => inferSkills(c.env, p));
  const have = new Set(p.skills.map(s => s.name.toLowerCase()));
  return c.json({ suggestions: (r.skills ?? []).filter(s => s?.name && !have.has(s.name.toLowerCase())) });
});

app.post('/ai/career', async c => {
  const p = await loadProfile(c.env, c.get('user').id);
  return c.json(await ai(c, 'ai.career', () => careerInsights(c.env, p)));
});

app.post('/ai/import', async c => {
  const ct = c.req.header('content-type') ?? '';
  let text = '';
  if (ct.includes('multipart/form-data')) {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) bad('Attach a PDF or text file.');
    const f = file as File;
    if (f.size > 5 * 1024 * 1024) bad('File is larger than 5 MB.');
    if (f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf') {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(await f.arrayBuffer()));
      const out = await extractText(pdf, { mergePages: true });
      text = Array.isArray(out.text) ? out.text.join('\n') : out.text;
    } else text = await f.text();
  } else {
    text = str((await c.req.json()).text, 20000);
  }
  if (text.trim().length < 40) bad('Could not read enough text from that file. If it is a scanned PDF, paste the text instead.');
  const draft = await ai(c, 'ai.import', () => parseResumeText(c.env, text), `${text.length} chars`);
  return c.json({ draft, chars: text.length });
});

app.post('/profile/import', async c => {
  const d = await c.req.json();
  const uid = c.get('user').id;
  const stmts: D1PreparedStatement[] = [];
  stmts.push(c.env.DB.prepare('UPDATE users SET phone=COALESCE(NULLIF(?,\'\'),phone), location=COALESCE(NULLIF(?,\'\'),location), headline=COALESCE(NULLIF(?,\'\'),headline), linkedin=COALESCE(NULLIF(?,\'\'),linkedin), github=COALESCE(NULLIF(?,\'\'),github) WHERE id=?')
    .bind(str(d.phone, 40), str(d.location, 120), str(d.headline, 160), str(d.linkedin, 200), str(d.github, 200), uid));
  for (const e of (d.education ?? []).slice(0, 6)) if (str(e.institution) && str(e.qualification))
    stmts.push(c.env.DB.prepare('INSERT INTO education (user_id,institution,qualification,start_year,end_year,cgpa) VALUES (?,?,?,?,?,?)').bind(uid, str(e.institution, 200), str(e.qualification, 200), num(e.start_year), num(e.end_year), num(e.cgpa)));
  for (const s of (d.skills ?? []).slice(0, 60)) if (str(s.name))
    stmts.push(c.env.DB.prepare('INSERT OR IGNORE INTO skills (user_id,name,category,level,source) VALUES (?,?,?,?,?)').bind(uid, str(s.name, 80), str(s.category, 30) || 'Technical', 3, 'import'));
  for (const x of (d.experiences ?? []).slice(0, 20)) if (str(x.title))
    stmts.push(c.env.DB.prepare('INSERT INTO experiences (user_id,kind,title,organisation,start_date,end_date,description) VALUES (?,?,?,?,?,?,?)').bind(uid, ['work', 'internship', 'project', 'activity'].includes(x.kind) ? x.kind : 'work', str(x.title, 160), str(x.organisation, 160), str(x.start_date, 20), str(x.end_date, 20), str(x.description, 2000)));
  for (const x of (d.certifications ?? []).slice(0, 20)) if (str(x.name))
    stmts.push(c.env.DB.prepare('INSERT INTO certifications (user_id,name,issuer,year) VALUES (?,?,?,?)').bind(uid, str(x.name, 160), str(x.issuer, 120), str(x.year, 10)));
  await c.env.DB.batch(stmts);
  await log(c, 'profile.import', `${stmts.length - 1} records`);
  return c.json({ ok: true, records: stmts.length - 1 });
});

// ── Resumes ─────────────────────────────────────────────────────────────────
app.get('/resumes', async c => {
  const r = await c.env.DB.prepare('SELECT id,title,target_role,template,ats_score,job_ref,created_at,updated_at FROM resumes WHERE user_id=? ORDER BY updated_at DESC').bind(c.get('user').id).all<Record<string, string>>();
  return c.json(r.results.map(x => ({ ...x, job_ref: x.job_ref ? JSON.parse(x.job_ref) : null })));
});

app.post('/resumes/generate', async c => {
  const b = await c.req.json();
  const targetRole = str(b.target_role, 120);
  if (!targetRole) bad('Say which role this resume is for.');
  const p = await loadProfile(c.env, c.get('user').id);
  if (!p.skills.length && !p.experiences.length && !p.subjects.length) bad('Your profile is empty. Add education, subjects or skills first.');
  const comp = await competency(c.env, p);
  const job: JobLite | undefined = b.job?.description ? { title: str(b.job.title, 160), company: str(b.job.company, 160), location: str(b.job.location, 120), description: str(b.job.description, 8000) } : undefined;
  const content = await ai(c, 'ai.resume', () => generateResume(c.env, p, { targetRole, tone: str(b.tone, 30) || 'professional', job, plos: comp.plos }), targetRole);
  const id = newId();
  const title = str(b.title, 120) || (job ? `${job.title} · ${job.company ?? ''}` : targetRole);
  await c.env.DB.prepare('INSERT INTO resumes (id,user_id,title,target_role,template,content,job_ref) VALUES (?,?,?,?,?,?,?)')
    .bind(id, p.user.id, title, targetRole, str(b.template, 30) || 'modern', JSON.stringify(content), job ? JSON.stringify({ title: job.title, company: job.company, url: str(b.job?.url, 400) }) : null).run();
  return c.json({ id, content }, 201);
});

app.get('/resumes/:id', async c => {
  const r = await c.env.DB.prepare('SELECT * FROM resumes WHERE id=? AND user_id=?').bind(c.req.param('id'), c.get('user').id).first<Record<string, string>>();
  if (!r) bad('Resume not found.', 404);
  return c.json({ ...r, content: JSON.parse(r!.content), job_ref: r!.job_ref ? JSON.parse(r!.job_ref) : null });
});

app.put('/resumes/:id', async c => {
  const b = await c.req.json();
  const res = await c.env.DB.prepare("UPDATE resumes SET title=COALESCE(?,title), template=COALESCE(?,template), content=COALESCE(?,content), updated_at=datetime('now') WHERE id=? AND user_id=?")
    .bind(str(b.title, 120) || null, str(b.template, 30) || null, b.content ? JSON.stringify(b.content) : null, c.req.param('id'), c.get('user').id).run();
  if (!res.meta.changes) bad('Resume not found.', 404);
  return c.json({ ok: true });
});

app.delete('/resumes/:id', async c => {
  await c.env.DB.prepare('DELETE FROM resumes WHERE id=? AND user_id=?').bind(c.req.param('id'), c.get('user').id).run();
  return c.json({ ok: true });
});

function resumeText(r: ResumeContent) {
  return [r.headline, r.summary, ...r.skills.flatMap(s => s.items), ...r.experience.flatMap(x => [x.title, ...x.bullets]), ...r.projects.flatMap(x => [x.title, ...x.bullets]), ...r.certifications.map(x => x.name)].join(' \n ');
}

app.post('/ai/ats', async c => {
  const b = await c.req.json();
  const jd = str(b.job_description, 12000);
  if (jd.length < 80) bad('Paste the full job description (at least a few lines).');
  const row = await c.env.DB.prepare('SELECT content FROM resumes WHERE id=? AND user_id=?').bind(str(b.resume_id, 60), c.get('user').id).first<{ content: string }>();
  if (!row) bad('Pick one of your resumes.', 404);
  const resume = JSON.parse(row!.content) as ResumeContent;
  const text = resumeText(resume);
  const wanted = extractKeywords(jd);
  const matched = wanted.filter(k => skillInText(k, text));
  const missing = wanted.filter(k => !matched.includes(k));
  const keywordScore = wanted.length ? Math.round((matched.length / wanted.length) * 100) : 0;
  const review = await ai(c, 'ai.ats', () => atsReview(c.env, resume, jd, { matched, missing }));
  const score = Math.round(0.4 * keywordScore + 0.6 * Math.max(0, Math.min(100, Number(review.score) || 0)));
  await c.env.DB.prepare('UPDATE resumes SET ats_score=? WHERE id=?').bind(score, str(b.resume_id, 60)).run();
  return c.json({ ...review, score, keywordScore, matched, missing, aiScore: review.score });
});

app.post('/ai/cover-letter', async c => {
  const b = await c.req.json();
  if (!str(b.job?.description)) bad('A job description is needed.');
  const p = await loadProfile(c.env, c.get('user').id);
  const job: JobLite = { title: str(b.job.title, 160), company: str(b.job.company, 160), location: str(b.job.location, 120), description: str(b.job.description, 8000) };
  return c.json(await ai(c, 'ai.cover_letter', () => coverLetter(c.env, p, job, str(b.tone, 30) || 'confident and friendly'), job.title));
});

// ── Jobs ────────────────────────────────────────────────────────────────────
app.get('/jobs/search', async c => {
  const q = str(c.req.query('q'), 80);
  if (!q) bad('Type a role or skill to search for.');
  const p = await loadProfile(c.env, c.get('user').id);
  const t = Date.now();
  const { jobs, sources, cached, localSource } = await searchJobs(c.env, q, str(c.req.query('location'), 80));
  const skills = p.skills.map(s => s.name);
  const ranked = jobs.map(j => ({ ...j, fit: quickMatch(skills, `${j.title} ${j.tags.join(' ')} ${j.description}`) }))
    .sort((a, b) => b.fit.score - a.fit.score)
    .map(j => ({ ...j, description: j.description.slice(0, 4000) }));
  await log(c, 'jobs.search', `${q} → ${jobs.length}`, true, t);
  return c.json({ jobs: ranked.slice(0, 40), sources, cached, localSource, skills: skills.length });
});

app.post('/jobs/fit', async c => {
  const b = await c.req.json();
  if (!str(b.description)) bad('Job description missing.');
  const p = await loadProfile(c.env, c.get('user').id);
  return c.json(await ai(c, 'ai.job_fit', () => jobFit(c.env, p, { title: str(b.title, 160), company: str(b.company, 160), description: str(b.description, 8000) }), str(b.title, 80)));
});

app.get('/jobs/saved', async c => {
  const r = await c.env.DB.prepare('SELECT id,job,match_score,status,notes,created_at FROM saved_jobs WHERE user_id=? ORDER BY created_at DESC').bind(c.get('user').id).all<Record<string, string>>();
  return c.json(r.results.map(x => ({ ...x, job: JSON.parse(x.job) })));
});

app.post('/jobs/saved', async c => {
  const b = await c.req.json();
  if (!str(b.job?.title)) bad('Job missing.');
  const id = newId();
  const job = { id: str(b.job.id, 120), title: str(b.job.title, 160), company: str(b.job.company, 160), location: str(b.job.location, 120), url: str(b.job.url, 500), source: str(b.job.source, 60), description: str(b.job.description, 6000) };
  await c.env.DB.prepare('INSERT INTO saved_jobs (id,user_id,job,match_score) VALUES (?,?,?,?)').bind(id, c.get('user').id, JSON.stringify(job), num(b.match_score)).run();
  return c.json({ id }, 201);
});

app.put('/jobs/saved/:id', async c => {
  const b = await c.req.json();
  const status = ['saved', 'applied', 'interview', 'offer', 'rejected'].includes(b.status) ? b.status : null;
  await c.env.DB.prepare('UPDATE saved_jobs SET status=COALESCE(?,status), notes=COALESCE(?,notes) WHERE id=? AND user_id=?').bind(status, typeof b.notes === 'string' ? b.notes.slice(0, 1000) : null, c.req.param('id'), c.get('user').id).run();
  return c.json({ ok: true });
});

app.delete('/jobs/saved/:id', async c => {
  await c.env.DB.prepare('DELETE FROM saved_jobs WHERE id=? AND user_id=?').bind(c.req.param('id'), c.get('user').id).run();
  return c.json({ ok: true });
});

// ── Coach (streaming chat) ──────────────────────────────────────────────────
app.use('/coach/*', requireUser);
app.use('/interviews', requireUser);
app.use('/interviews/*', requireUser);
app.use('/plan', requireUser);
app.use('/plan/*', requireUser);
app.use('/today', requireUser);

async function latestPlan(c: C) {
  const r = await c.env.DB.prepare('SELECT id,role,content,created_at FROM plans WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(c.get('user').id).first<{ id: string; role: string; content: string; created_at: string }>();
  return r ? { ...r, content: JSON.parse(r.content) as PlanContent } : null;
}

app.get('/coach/history', async c => {
  const r = await c.env.DB.prepare('SELECT id,role,content,created_at FROM (SELECT * FROM coach_messages WHERE user_id=? ORDER BY id DESC LIMIT 60) ORDER BY id').bind(c.get('user').id).all();
  return c.json(r.results);
});

app.delete('/coach/history', async c => {
  await c.env.DB.prepare('DELETE FROM coach_messages WHERE user_id=?').bind(c.get('user').id).run();
  return c.json({ ok: true });
});

app.post('/coach/chat', async c => {
  const b = await c.req.json().catch(() => ({}));
  const message = str(b.message, 2000);
  if (!message) bad('Type a message for your coach.');
  const uid = c.get('user').id;
  const [p, hist, plan, iv] = await Promise.all([
    loadProfile(c.env, uid),
    c.env.DB.prepare('SELECT role,content FROM (SELECT * FROM coach_messages WHERE user_id=? ORDER BY id DESC LIMIT 12) ORDER BY id').bind(uid).all<{ role: string; content: string }>(),
    latestPlan(c),
    c.env.DB.prepare('SELECT role,score FROM interviews WHERE user_id=? AND score IS NOT NULL ORDER BY created_at DESC LIMIT 1').bind(uid).first<{ role: string; score: number }>(),
  ]);
  const comp = await competency(c.env, p);
  const done = plan ? plan.content.weeks.flatMap(w => w.tasks).filter(t => t.done).length : 0;
  const total = plan ? plan.content.weeks.flatMap(w => w.tasks).length : 0;
  const system = coachSystem(p, { plos: comp.plos, readiness: comp.readiness, plan: plan ? `${plan.role}, ${done}/${total} tasks done` : null, lastInterview: iv ? `${iv.role}, scored ${iv.score}/100` : null });
  await c.env.DB.prepare('INSERT INTO coach_messages (user_id,role,content) VALUES (?,?,?)').bind(uid, 'user', message).run();
  const started = Date.now();
  const stream = await llmStream(c.env, {
    task: 'coach', input: { message }, speed: 'fast',
    messages: [{ role: 'system', content: system }, ...hist.results.map(h => ({ role: (h.role === 'coach' ? 'assistant' : 'user') as 'assistant' | 'user', content: h.content })), { role: 'user', content: message }],
    onDone: async full => {
      if (full.trim()) await c.env.DB.prepare('INSERT INTO coach_messages (user_id,role,content) VALUES (?,?,?)').bind(uid, 'coach', full.trim()).run();
      await log(c, 'ai.coach', message.slice(0, 80), !!full.trim(), started);
    },
  });
  return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' } });
});

// ── Mock interviews ─────────────────────────────────────────────────────────
type IvRow = { id: string; role: string; kind: string; questions: string; answers: string; score: number | null; created_at: string; finished_at: string | null };
const ivView = (r: IvRow) => ({ ...r, questions: JSON.parse(r.questions), answers: JSON.parse(r.answers) });

app.get('/interviews', async c => {
  const r = await c.env.DB.prepare('SELECT * FROM interviews WHERE user_id=? ORDER BY created_at DESC LIMIT 30').bind(c.get('user').id).all<IvRow>();
  return c.json(r.results.map(ivView));
});

app.post('/interviews', async c => {
  const b = await c.req.json().catch(() => ({}));
  const role = str(b.role, 120);
  if (!role) bad('Which role are you practising for?');
  const kind = ['behavioural', 'technical', 'mixed'].includes(b.kind) ? b.kind : 'mixed';
  const p = await loadProfile(c.env, c.get('user').id);
  const out = await ai(c, 'ai.interview', () => interviewQuestions(c.env, p, { role, kind, job: str(b.job, 4000) || undefined }), role);
  const questions = (out.questions ?? []).slice(0, 6).filter(q => q.q);
  if (!questions.length) bad('The AI did not return questions. Try again.');
  const id = newId();
  await c.env.DB.prepare('INSERT INTO interviews (id,user_id,role,kind,questions) VALUES (?,?,?,?,?)').bind(id, p.user.id, role, kind, JSON.stringify(questions)).run();
  return c.json(ivView((await c.env.DB.prepare('SELECT * FROM interviews WHERE id=?').bind(id).first<IvRow>())!), 201);
});

app.get('/interviews/:id', async c => {
  const r = await c.env.DB.prepare('SELECT * FROM interviews WHERE id=? AND user_id=?').bind(c.req.param('id'), c.get('user').id).first<IvRow>();
  if (!r) bad('Interview not found.', 404);
  return c.json(ivView(r!));
});

app.post('/interviews/:id/answer', async c => {
  const b = await c.req.json().catch(() => ({}));
  const r = await c.env.DB.prepare('SELECT * FROM interviews WHERE id=? AND user_id=?').bind(c.req.param('id'), c.get('user').id).first<IvRow>();
  if (!r) bad('Interview not found.', 404);
  const iv = ivView(r!);
  const index = Number(b.index), answer = str(b.answer, 4000);
  if (!Number.isInteger(index) || !iv.questions[index]) bad('Unknown question.');
  if (answer.length < 15) bad('Give a fuller answer (at least a sentence or two).');
  const p = await loadProfile(c.env, c.get('user').id);
  const q = iv.questions[index];
  const fb = await ai(c, 'ai.interview.grade', () => gradeAnswer(c.env, p, { role: iv.role, question: q.q, focus: q.focus, answer }), iv.role);
  const answers = [...iv.answers];
  answers[index] = { answer, ...fb, score: Math.max(1, Math.min(10, Math.round(Number(fb.score) || 0))) };
  const finished = iv.questions.every((_: unknown, i: number) => answers[i]);
  const score = finished ? Math.round((answers.reduce((s: number, a: { score: number }) => s + a.score, 0) / answers.length) * 10) : null;
  await c.env.DB.prepare('UPDATE interviews SET answers=?, score=?, finished_at=? WHERE id=?').bind(JSON.stringify(answers), score, finished ? new Date().toISOString() : null, iv.id).run();
  return c.json({ feedback: answers[index], score, finished });
});

app.delete('/interviews/:id', async c => {
  await c.env.DB.prepare('DELETE FROM interviews WHERE id=? AND user_id=?').bind(c.req.param('id'), c.get('user').id).run();
  return c.json({ ok: true });
});

// ── Learning plan ───────────────────────────────────────────────────────────
app.get('/plan', async c => c.json(await latestPlan(c)));

app.post('/plan', async c => {
  const b = await c.req.json().catch(() => ({}));
  const role = str(b.role, 120);
  if (!role) bad('Pick the role you are working towards.');
  const weeks = Math.max(2, Math.min(12, Number(b.weeks) || 6));
  const hours = Math.max(2, Math.min(30, Number(b.hours) || 6));
  const p = await loadProfile(c.env, c.get('user').id);
  const comp = await competency(c.env, p);
  const gaps = [...(Array.isArray(b.gaps) ? b.gaps.map((g: unknown) => str(g, 60)).filter(Boolean).slice(0, 10) : []), ...comp.plos.filter(x => x.strength < 40).map(x => x.domain).slice(0, 4)];
  const out = await ai(c, 'ai.plan', () => learningPlan(c.env, p, { role, weeks, hours, gaps }), role);
  const content: PlanContent = {
    summary: out.summary ?? '', role, certification: out.certification,
    weeks: (out.weeks ?? []).slice(0, weeks).map((w, i) => ({ week: i + 1, theme: w.theme ?? '', tasks: (w.tasks ?? []).slice(0, 6).map(t => ({ title: t.title, kind: t.kind ?? 'learn', resource: t.resource ?? '', minutes: Number(t.minutes) || 60, done: false })) })),
  };
  const id = newId();
  await c.env.DB.prepare('INSERT INTO plans (id,user_id,role,content) VALUES (?,?,?,?)').bind(id, p.user.id, role, JSON.stringify(content)).run();
  return c.json(await latestPlan(c), 201);
});

app.put('/plan/task', async c => {
  const b = await c.req.json().catch(() => ({}));
  const plan = await latestPlan(c);
  if (!plan) bad('No plan yet.', 404);
  const t = plan!.content.weeks[Number(b.week)]?.tasks[Number(b.index)];
  if (!t) bad('Unknown task.');
  t!.done = !!b.done;
  await c.env.DB.prepare('UPDATE plans SET content=? WHERE id=?').bind(JSON.stringify(plan!.content), plan!.id).run();
  if (t!.done) await log(c, 'plan.task', t!.title.slice(0, 80));
  return c.json({ ok: true });
});

// ── Today: streak, momentum and the next best moves ─────────────────────────
app.get('/today', async c => {
  const uid = c.get('user').id;
  const [p, days, plan, iv, resumes, saved, msgs] = await Promise.all([
    loadProfile(c.env, uid),
    c.env.DB.prepare("SELECT DISTINCT substr(created_at,1,10) d FROM activity WHERE user_id=? AND created_at >= datetime('now','-60 days') ORDER BY d DESC").bind(uid).all<{ d: string }>(),
    latestPlan(c),
    c.env.DB.prepare('SELECT id,role,score,created_at FROM interviews WHERE user_id=? ORDER BY created_at DESC LIMIT 1').bind(uid).first<{ id: string; role: string; score: number | null; created_at: string }>(),
    c.env.DB.prepare('SELECT id,title,ats_score FROM resumes WHERE user_id=? ORDER BY updated_at DESC').bind(uid).all<{ id: string; title: string; ats_score: number | null }>(),
    c.env.DB.prepare("SELECT status FROM saved_jobs WHERE user_id=?").bind(uid).all<{ status: string }>(),
    c.env.DB.prepare('SELECT COUNT(*) n FROM coach_messages WHERE user_id=?').bind(uid).first<number>('n'),
  ]);
  const views = await c.env.DB.prepare("SELECT COUNT(DISTINCT recruiter_id) n FROM profile_views WHERE student_id=? AND created_at > datetime('now','-30 days')").bind(uid).first<number>('n');
  const comp = await competency(c.env, p);
  // streak: consecutive active days ending today or yesterday (UTC)
  const set = new Set(days.results.map(r => r.d));
  const day = (off: number) => new Date(Date.now() - off * 864e5).toISOString().slice(0, 10);
  let streak = 0;
  for (let i = set.has(day(0)) ? 0 : 1; set.has(day(i)); i++) streak++;
  const week = Array.from({ length: 14 }, (_, i) => ({ day: day(13 - i), active: set.has(day(13 - i)) }));

  // plan: current week = first week with an unfinished task
  let planWeek = null as null | { index: number; week: number; theme: string; tasks: (PlanContent['weeks'][number]['tasks'][number] & { i: number })[] };
  let planProgress = 0;
  if (plan) {
    const all = plan.content.weeks.flatMap(w => w.tasks);
    planProgress = all.length ? Math.round((all.filter(t => t.done).length / all.length) * 100) : 0;
    const wi = plan.content.weeks.findIndex(w => w.tasks.some(t => !t.done));
    if (wi >= 0) { const w = plan.content.weeks[wi]; planWeek = { index: wi, week: w.week, theme: w.theme, tasks: w.tasks.map((t, i) => ({ ...t, i })) }; }
  }

  // next best moves, in the order that unlocks the most value
  const moves: { title: string; why: string; to: string; kind: string }[] = [];
  if (!p.education.length) moves.push({ kind: 'map', title: 'Map your subjects', why: 'Everything else builds on the subjects you have passed.', to: '/app/start' });
  if (p.education.length && p.skills.length < 5) moves.push({ kind: 'skills', title: 'Turn subjects into skills', why: 'One click adds skills with the subject as evidence.', to: '/app/profile?tab=skills' });
  if (!p.experiences.length) moves.push({ kind: 'experience', title: 'Add one project or internship', why: 'Recruiters look for proof you have built something.', to: '/app/profile?tab=experience' });
  if (!plan) moves.push({ kind: 'plan', title: 'Get a learning plan', why: 'A week-by-week route to the role you want.', to: '/app/plan' });
  if (!resumes.results.length) moves.push({ kind: 'resume', title: 'Generate your first resume', why: 'Written from your record in under a minute.', to: '/app/resumes?new=1' });
  else if (resumes.results.every(r => r.ats_score == null)) moves.push({ kind: 'ats', title: 'Check a resume against a real job ad', why: 'See which keywords you are missing.', to: '/app/ats' });
  const ivAge = iv ? (Date.now() - Date.parse(iv.created_at.replace(' ', 'T') + (iv.created_at.endsWith('Z') ? '' : 'Z'))) / 864e5 : 99;
  if (ivAge > 5) moves.push({ kind: 'interview', title: iv ? 'Practise another interview' : 'Try a 5-question mock interview', why: iv?.score != null ? `Last score ${iv.score}/100. Practice compounds.` : 'Ten minutes, instant feedback on every answer.', to: '/app/interview' });
  if (!saved.results.length) moves.push({ kind: 'jobs', title: 'Save three jobs you would apply for', why: 'Ranked by how many of their skills you can prove.', to: '/app/jobs' });
  if (!p.user.share_profile && p.skills.length >= 5) moves.push({ kind: 'share', title: 'Let recruiters find you', why: 'Partner recruiters search PathForward for students with your skills.', to: '/app/profile?tab=about' });
  if (!msgs) moves.push({ kind: 'coach', title: 'Ask your coach anything', why: 'It already knows your subjects and skills.', to: '/app/coach' });

  return c.json({
    name: p.user.name.split(' ')[0], views: views ?? 0, sharing: !!p.user.share_profile, streak, week, readiness: comp.readiness, covered: comp.covered, total: comp.total,
    moves: moves.slice(0, 3),
    plan: plan ? { role: plan.role, progress: planProgress, current: planWeek, weeks: plan.content.weeks.length } : null,
    interview: iv, resumes: resumes.results.length, applied: saved.results.filter(s => s.status !== 'saved').length, saved: saved.results.length,
    journey: [
      { key: 'map', label: 'Map', done: p.education.length > 0 && p.subjects.length > 0 },
      { key: 'skills', label: 'Skills', done: p.skills.length >= 5 },
      { key: 'resume', label: 'Resume', done: resumes.results.length > 0 },
      { key: 'practice', label: 'Practice', done: !!iv?.score },
      { key: 'apply', label: 'Apply', done: saved.results.some(s => s.status !== 'saved') },
    ],
  });
});


// Admin: invite a recruiter. Creates the account with a one-time password the
// recruiter must change at first sign-in, or upgrades an existing account.
app.post('/admin/recruiters', async c => {
  const b = await c.req.json().catch(() => ({}));
  const name = str(b.name, 120), email = str(b.email, 160).toLowerCase(), company = str(b.company, 160);
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) bad('Enter the recruiter\'s name and a valid email.');
  if (!company) bad('Enter the recruiter\'s company.');
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first<{ id: string }>();
  if (existing) {
    await c.env.DB.prepare("UPDATE users SET role='recruiter', company=? WHERE id=?").bind(company, existing.id).run();
    await log(c, 'admin.recruiter', `upgraded ${email}`);
    return c.json({ id: existing.id, email, existing: true, password: null }, 200);
  }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const password = Array.from(crypto.getRandomValues(new Uint8Array(12)), n => alphabet[n % alphabet.length]).join('');
  const id = newId();
  await c.env.DB.prepare("INSERT INTO users (id,name,email,password_hash,role,company,must_change_password) VALUES (?,?,?,?,'recruiter',?,1)")
    .bind(id, name, email, await hashPassword(password), company).run();
  await log(c, 'admin.recruiter', `invited ${email}`);
  return c.json({ id, email, existing: false, password }, 201);
});

app.get('/admin/recruiters', async c => {
  const r = await c.env.DB.prepare("SELECT u.id,u.name,u.email,u.company,u.must_change_password pending,u.created_at,(SELECT COUNT(*) FROM shortlist s WHERE s.recruiter_id=u.id) shortlisted,(SELECT COUNT(*) FROM profile_views v WHERE v.recruiter_id=u.id) views FROM users u WHERE u.role='recruiter' ORDER BY u.created_at DESC").all();
  return c.json(r.results);
});

// ── Recruiters: talent search and shortlist ─────────────────────────────────
// Only students who switched on "Let recruiters find me" ever appear here.
async function candidateCard(env: Env, id: string) {
  const p = await loadProfile(env, id);
  const comp = await competency(env, p);
  const iv = await env.DB.prepare('SELECT MAX(score) s FROM interviews WHERE user_id=?').bind(id).first<number>('s');
  return {
    id, name: p.user.name, headline: p.user.headline, location: p.user.location, avatar_url: p.user.avatar_url,
    programme: p.education[0]?.qualification ?? null, institution: p.education[0]?.institution ?? null, grad_year: p.education[0]?.end_year ?? null, cgpa: p.education[0]?.cgpa ?? null,
    readiness: comp.readiness, covered: comp.covered, total: comp.total,
    skills: p.skills.slice(0, 12).map(s => s.name), certifications: p.certifications.map(x => x.name), best_interview: iv ?? null,
    _p: p, _comp: comp,
  };
}

app.get('/talent', async c => {
  const q = (c.req.query('q') ?? '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
  const programme = Number(c.req.query('programme')) || null;
  const minReady = Number(c.req.query('min')) || 0;
  const certOnly = c.req.query('cert') === '1';
  const ids = await c.env.DB.prepare(`SELECT u.id FROM users u WHERE u.role='student' AND u.share_profile=1 ${programme ? 'AND EXISTS (SELECT 1 FROM education e WHERE e.user_id=u.id AND e.programme_id=?)' : ''} ORDER BY u.created_at DESC LIMIT 200`)
    .bind(...(programme ? [programme] : [])).all<{ id: string }>();
  const rid = c.get('user').id;
  const listed = new Map((await c.env.DB.prepare('SELECT student_id,stage FROM shortlist WHERE recruiter_id=?').bind(rid).all<{ student_id: string; stage: string }>()).results.map(r => [r.student_id, r.stage]));
  const out = [];
  for (const { id } of ids.results) {
    const card = await candidateCard(c.env, id);
    if (card.readiness < minReady) continue;
    if (certOnly && !card.certifications.length) continue;
    const hay = [...card._p.skills.map(s => s.name), ...card._p.subjects.map(s => s.name), ...card.certifications, card.headline ?? '', ...card._p.experiences.map(x => `${x.title} ${x.description ?? ''}`)].join(' ').toLowerCase();
    const hits = q.filter(t => skillInText(t, hay) || hay.includes(t));
    if (q.length && !hits.length) continue;
    const { _p, _comp, ...pub } = card;
    out.push({ ...pub, match: q.length ? Math.round((hits.length / q.length) * 100) : null, matched: hits, stage: listed.get(id) ?? null });
  }
  out.sort((a, b) => (b.match ?? 0) - (a.match ?? 0) || b.readiness - a.readiness);
  await log(c, 'talent.search', q.join(', '));
  return c.json(out.slice(0, 60));
});

app.get('/talent/shortlist', async c => {
  const rows = await c.env.DB.prepare('SELECT s.student_id,s.stage,s.note,s.role,s.updated_at FROM shortlist s JOIN users u ON u.id=s.student_id WHERE s.recruiter_id=? AND u.share_profile=1 ORDER BY s.updated_at DESC').bind(c.get('user').id).all<{ student_id: string; stage: string; note: string | null; role: string | null; updated_at: string }>();
  const out = [];
  for (const r of rows.results) { const { _p, _comp, ...card } = await candidateCard(c.env, r.student_id); out.push({ ...card, stage: r.stage, note: r.note, for_role: r.role, updated_at: r.updated_at }); }
  return c.json(out);
});

app.get('/talent/:id', async c => {
  const id = c.req.param('id');
  const ok = await c.env.DB.prepare("SELECT 1 FROM users WHERE id=? AND role='student' AND share_profile=1").bind(id).first();
  if (!ok) bad('This student is not sharing their profile.', 404);
  const { _p: p, _comp: comp, ...card } = await candidateCard(c.env, id);
  const rid = c.get('user').id;
  const recent = await c.env.DB.prepare("SELECT 1 FROM profile_views WHERE recruiter_id=? AND student_id=? AND created_at > datetime('now','-1 day')").bind(rid, id).first();
  if (!recent) await c.env.DB.prepare('INSERT INTO profile_views (recruiter_id,student_id) VALUES (?,?)').bind(rid, id).run();
  const sl = await c.env.DB.prepare('SELECT stage,note,role FROM shortlist WHERE recruiter_id=? AND student_id=?').bind(rid, id).first();
  return c.json({
    ...card, email: p.user.email, phone: p.user.phone, linkedin: p.user.linkedin, github: p.user.github, website: p.user.website,
    plos: comp.plos, subjects: p.subjects.map(s => s.name), skillsFull: p.skills, experiences: p.experiences, certificationsFull: p.certifications, education: p.education,
    shortlist: sl,
  });
});

app.put('/talent/:id/shortlist', async c => {
  const id = c.req.param('id');
  const ok = await c.env.DB.prepare("SELECT 1 FROM users WHERE id=? AND role='student' AND share_profile=1").bind(id).first();
  if (!ok) bad('This student is not sharing their profile.', 404);
  const b = await c.req.json().catch(() => ({}));
  const stage = ['shortlisted', 'contacted', 'interviewing', 'offered', 'passed'].includes(b.stage) ? b.stage : 'shortlisted';
  await c.env.DB.prepare(`INSERT INTO shortlist (recruiter_id,student_id,stage,note,role) VALUES (?,?,?,?,?)
    ON CONFLICT(recruiter_id,student_id) DO UPDATE SET stage=excluded.stage, note=COALESCE(excluded.note,shortlist.note), role=COALESCE(excluded.role,shortlist.role), updated_at=datetime('now')`)
    .bind(c.get('user').id, id, stage, b.note === undefined ? null : str(b.note, 1000), b.role === undefined ? null : str(b.role, 120)).run();
  return c.json({ ok: true, stage });
});

app.delete('/talent/:id/shortlist', async c => {
  await c.env.DB.prepare('DELETE FROM shortlist WHERE recruiter_id=? AND student_id=?').bind(c.get('user').id, c.req.param('id')).run();
  return c.json({ ok: true });
});

// ── Admin ───────────────────────────────────────────────────────────────────
app.get('/admin/stats', async c => {
  const db = c.env.DB;
  const one = (sql: string) => db.prepare(sql).first<number>('n');
  const [users, resumes, saved, aiCalls, aiFails, avgMs, avgAts] = await Promise.all([
    one('SELECT COUNT(*) n FROM users'), one('SELECT COUNT(*) n FROM resumes'), one('SELECT COUNT(*) n FROM saved_jobs'),
    one("SELECT COUNT(*) n FROM activity WHERE action LIKE 'ai.%'"), one("SELECT COUNT(*) n FROM activity WHERE action LIKE 'ai.%' AND ok=0"),
    one("SELECT CAST(AVG(ms) AS INTEGER) n FROM activity WHERE action LIKE 'ai.%' AND ok=1"), one('SELECT CAST(AVG(ats_score) AS INTEGER) n FROM resumes WHERE ats_score IS NOT NULL'),
  ]);
  const daily = await db.prepare("SELECT substr(created_at,1,10) day, COUNT(*) n FROM activity WHERE created_at >= datetime('now','-13 days') GROUP BY day ORDER BY day").all();
  const byAction = await db.prepare("SELECT action, COUNT(*) n, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) fails, CAST(AVG(ms) AS INTEGER) ms FROM activity GROUP BY action ORDER BY n DESC LIMIT 12").all();
  const topSkills = await db.prepare('SELECT name, COUNT(*) n FROM skills GROUP BY lower(name) ORDER BY n DESC LIMIT 10').all();
  return c.json({ users, resumes, saved, aiCalls, aiFails, avgMs, avgAts, daily: daily.results, byAction: byAction.results, topSkills: topSkills.results });
});

app.get('/admin/users', async c => {
  const r = await c.env.DB.prepare('SELECT u.id,u.name,u.email,u.role,u.created_at,(SELECT COUNT(*) FROM resumes r WHERE r.user_id=u.id) resumes,(SELECT COUNT(*) FROM skills s WHERE s.user_id=u.id) skills FROM users u ORDER BY u.created_at DESC LIMIT 200').all();
  return c.json(r.results);
});

app.put('/admin/users/:id/role', async c => {
  const r = (await c.req.json()).role;
  const role = ['admin', 'recruiter', 'student'].includes(r) ? r : 'student';
  await c.env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(role, c.req.param('id')).run();
  return c.json({ ok: true });
});

app.get('/admin/activity', async c => {
  const r = await c.env.DB.prepare('SELECT a.id,a.action,a.detail,a.ok,a.ms,a.created_at,u.email FROM activity a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100').all();
  return c.json(r.results);
});

app.post('/admin/subjects', async c => {
  const b = await c.req.json();
  if (!num(b.programme_id) || !str(b.name)) bad('Programme and subject name are required.');
  const arr = (v: unknown) => JSON.stringify(Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : String(v ?? '').split(/[\n,;]/).map(x => x.trim()).filter(Boolean));
  const r = await c.env.DB.prepare('INSERT INTO subjects (programme_id,code,name,year,clos,plo_codes,skills) VALUES (?,?,?,?,?,?,?)')
    .bind(num(b.programme_id), str(b.code, 20), str(b.name, 160), num(b.year), arr(b.clos), arr(b.plo_codes), arr(b.skills)).run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

app.put('/admin/subjects/:id', async c => {
  const b = await c.req.json();
  const arr = (v: unknown) => JSON.stringify(Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : String(v ?? '').split(/[\n,;]/).map(x => x.trim()).filter(Boolean));
  await c.env.DB.prepare('UPDATE subjects SET code=?,name=?,year=?,clos=?,plo_codes=?,skills=? WHERE id=?')
    .bind(str(b.code, 20), str(b.name, 160), num(b.year), arr(b.clos), arr(b.plo_codes), arr(b.skills), Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

app.delete('/admin/subjects/:id', async c => {
  await c.env.DB.prepare('DELETE FROM subjects WHERE id=?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

app.post('/admin/programmes', async c => {
  const b = await c.req.json();
  if (!num(b.faculty_id) || !str(b.name)) bad('Faculty and programme name are required.');
  const r = await c.env.DB.prepare('INSERT INTO programmes (faculty_id,code,name,level) VALUES (?,?,?,?)').bind(num(b.faculty_id), str(b.code, 20), str(b.name, 200), str(b.level, 40) || 'Bachelor').run();
  const pid = r.meta.last_row_id;
  // copy the standard 11 PLOs from programme 1 as a starting point
  await c.env.DB.prepare('INSERT INTO plos (programme_id,code,domain,description,sort_order) SELECT ?,code,domain,description,sort_order FROM plos WHERE programme_id=(SELECT MIN(id) FROM programmes)').bind(pid).run();
  return c.json({ id: pid }, 201);
});

app.route('/org', org);

app.all('*', c => c.json({ error: 'Not found' }, 404));

export default app;
