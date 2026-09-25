/**
 * Live job search across public job APIs, normalised to one shape.
 *  - Remotive      (remote jobs, no key)
 *  - Arbeitnow     (remote + EU jobs, no key)
 *  - JSearch       (Google for Jobs, incl. Malaysia; needs RAPIDAPI_KEY)
 */
import type { Env } from './env';
import { stripHtml } from './text';

export interface Job {
  id: string; title: string; company: string; location: string; remote: boolean;
  url: string; source: string; posted: string | null; salary: string | null;
  tags: string[]; description: string;
}

const cache = new Map<string, { at: number; jobs: Job[] }>();
const TTL = 10 * 60 * 1000;

async function getJson(url: string, init?: RequestInit, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal, headers: { 'user-agent': 'PathForward/1.0 (student project)', ...(init?.headers ?? {}) } });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function remotive(q: string): Promise<Job[]> {
  const d = await getJson(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=25`) as { jobs: Record<string, any>[] };
  return d.jobs.map(j => ({
    id: `remotive-${j.id}`, title: j.title, company: j.company_name, location: j.candidate_required_location || 'Remote', remote: true,
    url: j.url, source: 'Remotive', posted: j.publication_date ?? null, salary: j.salary || null, tags: j.tags ?? [],
    description: stripHtml(j.description ?? '').slice(0, 6000),
  }));
}

async function arbeitnow(q: string): Promise<Job[]> {
  const d = await getJson('https://www.arbeitnow.com/api/job-board-api') as { data: Record<string, any>[] };
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  return d.data
    .filter(j => terms.every(t => `${j.title} ${(j.tags ?? []).join(' ')} ${j.description}`.toLowerCase().includes(t)))
    .slice(0, 20)
    .map(j => ({
      id: `arbeitnow-${j.slug}`, title: j.title, company: j.company_name, location: j.location || (j.remote ? 'Remote' : ''), remote: !!j.remote,
      url: j.url, source: 'Arbeitnow', posted: j.created_at ? new Date(j.created_at * 1000).toISOString() : null, salary: null, tags: j.tags ?? [],
      description: stripHtml(j.description ?? '').slice(0, 6000),
    }));
}

async function jsearch(q: string, location: string, key: string): Promise<Job[]> {
  const query = location ? `${q} in ${location}` : `${q} in Malaysia`;
  const d = await getJson(`https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&num_pages=1&date_posted=month`, {
    headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': 'jsearch.p.rapidapi.com' },
  }) as { data: Record<string, any>[] };
  return (d.data ?? []).map(j => ({
    id: `jsearch-${j.job_id}`, title: j.job_title, company: j.employer_name, location: [j.job_city, j.job_country].filter(Boolean).join(', '), remote: !!j.job_is_remote,
    url: j.job_apply_link || j.job_google_link, source: j.job_publisher ? `JSearch · ${j.job_publisher}` : 'JSearch', posted: j.job_posted_at_datetime_utc ?? null,
    salary: j.job_min_salary ? `${j.job_salary_currency ?? ''} ${j.job_min_salary}–${j.job_max_salary ?? ''} / ${j.job_salary_period ?? ''}` : null,
    tags: j.job_required_skills ?? [], description: String(j.job_description ?? '').slice(0, 6000),
  }));
}

export async function searchJobs(env: Env, q: string, location: string) {
  const key = `${q}|${location}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { jobs: hit.jobs, sources: [], cached: true };

  const tasks: [string, Promise<Job[]>][] = [
    ['Remotive', remotive(q)],
    ['Arbeitnow', arbeitnow(q)],
  ];
  if (env.RAPIDAPI_KEY) tasks.unshift(['JSearch', jsearch(q, location, env.RAPIDAPI_KEY)]);

  const settled = await Promise.allSettled(tasks.map(t => t[1]));
  const sources = tasks.map(([name], i) => ({ name, ok: settled[i].status === 'fulfilled', count: settled[i].status === 'fulfilled' ? (settled[i] as PromiseFulfilledResult<Job[]>).value.length : 0 }));
  const seen = new Set<string>();
  const jobs = settled.flatMap(s => (s.status === 'fulfilled' ? s.value : [])).filter(j => {
    const k = `${j.title}|${j.company}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (jobs.length) cache.set(key, { at: Date.now(), jobs });
  return { jobs, sources, cached: false };
}
