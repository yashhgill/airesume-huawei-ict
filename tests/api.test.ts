/**
 * End-to-end API test: runs the real Hono app against a fresh SQLite database
 * (same schema as D1) with the offline LLM mock and stubbed job APIs.
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import app from '../server/app';
import { SqliteD1 } from '../server/lib/sqlite-d1';
import { quickMatch } from '../server/lib/text';
import type { Env } from '../server/lib/env';

const db = new SqliteD1(join(mkdtempSync(join(tmpdir(), 'airesume-')), 'test.db'));
db.migrate(resolve('migrations'));
const env: Env = { DB: db as unknown as D1Database, JWT_SECRET: 'test', LLM_PROVIDER: 'mock', ADMIN_EMAILS: 'admin@test.my' };

// Stub outbound job APIs
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: string | URL | Request) => {
  const u = String(url);
  if (u.includes('remotive.com')) return Response.json({ jobs: [{ id: 1, title: 'Junior Cloud Engineer', company_name: 'Acme', candidate_required_location: 'APAC', url: 'https://x/1', tags: ['aws', 'docker'], description: '<p>We need Docker, Kubernetes, Linux and CI/CD. Python is a plus.</p>' }] });
  if (u.includes('arbeitnow.com')) return Response.json({ data: [{ slug: 'a', title: 'Cloud Engineer (Graduate)', company_name: 'Beta', location: 'Remote', remote: true, url: 'https://x/2', tags: ['cloud'], description: 'Terraform, Linux, cloud networking', created_at: 1_700_000_000 }] });
  return realFetch(url as string);
}) as typeof fetch;

let token = '';
async function call(method: string, path: string, body?: unknown, auth = token) {
  const res = await app.fetch(new Request(`http://t/api${path}`, {
    method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  return { status: res.status, body: await res.json() as any };
}

test('health + catalogue are public', async () => {
  const h = await call('GET', '/health', undefined, '');
  assert.equal(h.status, 200);
  assert.equal(h.body.ai, 'mock');
  const cat = await call('GET', '/catalog', undefined, '');
  assert.equal(cat.body.programmes.length, 5);
  const prog = await call('GET', '/catalog/programmes/1', undefined, '');
  assert.equal(prog.body.plos.length, 11);
  assert.ok(prog.body.subjects.length >= 15);
});

test('auth: register, reject bad login, protected routes', async () => {
  const r = await call('POST', '/auth/register', { name: 'Aina', email: 'aina@student.utem.edu.my', password: 'password123' }, '');
  assert.equal(r.status, 201);
  token = r.body.token;
  assert.equal((await call('POST', '/auth/register', { name: 'Aina', email: 'aina@student.utem.edu.my', password: 'password123' }, '')).status, 409);
  assert.equal((await call('POST', '/auth/login', { email: 'aina@student.utem.edu.my', password: 'wrong-pass' }, '')).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'aina@student.utem.edu.my', password: 'password123' }, '')).status, 200);
  assert.equal((await call('GET', '/me', undefined, '')).status, 401);
  assert.equal((await call('GET', '/admin/stats')).status, 403);
});

test('profile → subjects → skills → competency', async () => {
  await call('PUT', '/me', { name: 'Aina', phone: '012-3456789', location: 'Melaka', headline: 'Cloud computing student', github: 'github.com/aina' });
  assert.equal((await call('POST', '/profile/education', { programme_id: 1, start_year: 2023, end_year: 2027, cgpa: 3.62 })).status, 201);
  const prog = await call('GET', '/catalog/programmes/1');
  const ids = prog.body.subjects.slice(0, 12).map((s: any) => s.id);
  assert.equal((await call('PUT', '/profile/subjects', { subject_ids: ids })).body.count, 12);

  const fromSubjects = await call('POST', '/profile/skills/from-subjects');
  assert.ok(fromSubjects.body.added >= 10, 'curriculum skills added');
  const ai = await call('POST', '/ai/skills');
  assert.ok(ai.body.suggestions.length > 0);
  await call('POST', '/profile/skills', { skills: ai.body.suggestions });

  await call('POST', '/profile/experiences', { kind: 'project', title: 'Serverless resume builder', description: 'Built and deployed a team project on Cloudflare Workers; presented to lecturers.' });
  await call('POST', '/profile/experiences', { kind: 'activity', title: 'President, Computing Club', organisation: 'UTeM', description: 'Led a committee of 12 and organised a hackathon.' });
  await call('POST', '/profile/certifications', { name: 'HCIA-Cloud Computing', issuer: 'Huawei', year: '2026' });

  const comp = await call('GET', '/profile/competency');
  assert.equal(comp.body.total, 11);
  assert.ok(comp.body.covered >= 6, `covered ${comp.body.covered}`);
  const lead = comp.body.plos.find((p: any) => p.code === 'PLO8');
  assert.ok(lead.evidence.includes('President, Computing Club'));
  assert.ok(comp.body.readiness > 50 && comp.body.readiness <= 100);
});

test('resume generation, edit, ATS check, cover letter', async () => {
  const g = await call('POST', '/resumes/generate', { target_role: 'Cloud Engineer', tone: 'professional', template: 'modern' });
  assert.equal(g.status, 201);
  assert.equal(g.body.content.name, 'Aina');
  assert.ok(g.body.content.education[0].details.includes('CGPA 3.62'));
  assert.ok(g.body.content.competencies.length > 0);

  const upd = await call('PUT', `/resumes/${g.body.id}`, { content: { ...g.body.content, summary: 'Edited summary' } });
  assert.equal(upd.status, 200);
  assert.equal((await call('GET', `/resumes/${g.body.id}`)).body.content.summary, 'Edited summary');

  const ats = await call('POST', '/ai/ats', { resume_id: g.body.id, job_description: 'We are hiring a graduate cloud engineer with Docker, Kubernetes, Linux, Terraform and Python. You will build CI/CD pipelines.' });
  assert.equal(ats.status, 200);
  assert.ok(ats.body.matched.length > 0, 'some keywords matched');
  assert.ok(ats.body.missing.length > 0);
  assert.ok(ats.body.score > 0);

  const cl = await call('POST', '/ai/cover-letter', { job: { title: 'Cloud Engineer', company: 'Acme', description: 'Docker and Linux' } });
  assert.ok(cl.body.body.includes('Aina'));
  assert.equal((await call('GET', '/resumes')).body.length, 1);
});

test('job search ranks by skill fit; save and track', async () => {
  const s = await call('GET', '/jobs/search?q=cloud%20engineer');
  assert.equal(s.status, 200);
  assert.equal(s.body.jobs.length, 2);
  assert.ok(s.body.jobs[0].fit.score >= s.body.jobs[1].fit.score);
  const saved = await call('POST', '/jobs/saved', { job: s.body.jobs[0], match_score: s.body.jobs[0].fit.score });
  assert.equal(saved.status, 201);
  await call('PUT', `/jobs/saved/${saved.body.id}`, { status: 'applied' });
  assert.equal((await call('GET', '/jobs/saved')).body[0].status, 'applied');
  const fit = await call('POST', '/jobs/fit', s.body.jobs[0]);
  assert.ok(fit.body.score > 0);
});

test('resume import (text) and apply', async () => {
  const d = await call('POST', '/ai/import', { text: 'Imported Name. Diploma in IT, Politeknik Melaka 2019-2021. IT Intern at Acme Sdn Bhd. Skills: Python.' });
  assert.equal(d.status, 200);
  const a = await call('POST', '/profile/import', d.body.draft);
  assert.ok(a.body.records >= 3);
});

test('admin sees stats and can edit curriculum', async () => {
  const r = await call('POST', '/auth/register', { name: 'Admin', email: 'admin@test.my', password: 'password123' }, '');
  const admin = r.body.token;
  const st = await call('GET', '/admin/stats', undefined, admin);
  assert.equal(st.status, 200);
  assert.ok(st.body.aiCalls >= 5);
  const sub = await call('POST', '/admin/subjects', { programme_id: 3, name: 'Machine Learning', year: 2, clos: 'Train and evaluate models', plo_codes: 'PLO2, PLO3', skills: 'Machine Learning, Python' }, admin);
  assert.equal(sub.status, 201);
  const prog = await call('GET', '/catalog/programmes/3', undefined, '');
  assert.deepEqual(prog.body.subjects.find((s: any) => s.name === 'Machine Learning').plo_codes, ['PLO2', 'PLO3']);
});

test('quickMatch understands aliases', () => {
  const m = quickMatch(['Kubernetes', 'MySQL', 'Node.js'], 'Experience with k8s, SQL databases and NodeJS required');
  assert.ok(m.score > 0);
  assert.ok(m.matched.includes('Kubernetes'));
});
