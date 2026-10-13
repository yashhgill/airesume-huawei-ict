import type { Env } from './env';

/**
 * Finds exact learning resources (a specific YouTube video, a specific course page) for a plan task.
 * Sources, in order: YouTube Data API (if YOUTUBE_API_KEY) or the public YouTube results page;
 * Coursera's public catalogue API; Microsoft Learn's public search API. Results are cached in D1.
 */
export interface Link { label: string; title: string; url: string; kind: 'video' | 'course' | 'docs' | 'practice' | 'jobs'; meta?: string }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const enc = encodeURIComponent;
const clean = (s: string) => s.replace(/\\u0026/g, '&').replace(/\\"/g, '"').replace(/\\u0027/g, "'").replace(/\s+/g, ' ').trim();

async function timed(url: string, init: RequestInit = {}, ms = 6000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

export async function youtubeVideo(env: Env, q: string): Promise<Link | null> {
  try {
    if (env.YOUTUBE_API_KEY) {
      const r = await timed(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&relevanceLanguage=en&videoEmbeddable=true&q=${enc(q)}&key=${env.YOUTUBE_API_KEY}`);
      if (r.ok) {
        const j = await r.json() as { items?: { id: { videoId: string }; snippet: { title: string; channelTitle: string } }[] };
        const v = j.items?.[0];
        if (v) return { label: 'Watch', title: clean(v.snippet.title), url: `https://www.youtube.com/watch?v=${v.id.videoId}`, kind: 'video', meta: v.snippet.channelTitle };
      }
    }
    const r = await timed(`https://www.youtube.com/results?search_query=${enc(q)}&sp=EgIQAQ%253D%253D`, { headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' } });
    if (!r.ok) return null;
    const html = await r.text();
    // Organic results only (ads use other renderers). Take the first one that has a duration.
    const re = /"videoRenderer":\{"videoId":"([\w-]{11})"([\s\S]{0,4000}?)"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const tail = html.slice(m.index, m.index + 6000);
      const ch = /"ownerText":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/.exec(tail)?.[1];
      const len = /"lengthText":\{[\s\S]{0,300}?"simpleText":"([\d:]+)"/.exec(tail)?.[1];
      if (!len) continue;
      return { label: 'Watch', title: clean(m[3]), url: `https://www.youtube.com/watch?v=${m[1]}`, kind: 'video', meta: [ch && clean(ch), len].filter(Boolean).join(' · ') };
    }
  } catch { /* network or format change: fall through */ }
  return null;
}

export async function courseraCourse(q: string): Promise<Link | null> {
  try {
    const r = await timed(`https://api.coursera.org/api/courses.v1?q=search&query=${enc(q)}&fields=name,slug,partnerIds&limit=3`);
    if (!r.ok) return null;
    const j = await r.json() as { elements?: { name: string; slug: string }[] };
    const c = j.elements?.find(e => e.slug);
    return c ? { label: 'Course', title: clean(c.name), url: `https://www.coursera.org/learn/${c.slug}`, kind: 'course', meta: 'Coursera · free to audit' } : null;
  } catch { return null; }
}

export async function msLearn(q: string): Promise<Link | null> {
  try {
    const r = await timed(`https://learn.microsoft.com/api/search?search=${enc(q)}&locale=en-us&%24top=3&facet=category&%24filter=(category%20eq%20%27Training%27)`);
    if (!r.ok) return null;
    const j = await r.json() as { results?: { title: string; url: string }[] };
    const x = j.results?.[0];
    return x ? { label: 'Course', title: clean(x.title), url: x.url, kind: 'course', meta: 'Microsoft Learn · free' } : null;
  } catch { return null; }
}

/** Fixed official entry points for providers without a public search API. */
const OFFICIAL: { re: RegExp; link: Link }[] = [
  { re: /huawei|hcia|hcip/i, link: { label: 'Course', title: 'Huawei Talent online courses (free)', url: 'https://e.huawei.com/en/talent/', kind: 'course', meta: 'Huawei' } },
  { re: /cloud practitioner|aws/i, link: { label: 'Course', title: 'AWS Cloud Practitioner Essentials (free)', url: 'https://aws.amazon.com/training/digital/aws-cloud-practitioner-essentials/', kind: 'course', meta: 'AWS Skill Builder' } },
  { re: /netacad|cisco|ccna/i, link: { label: 'Course', title: 'Cisco Networking Academy courses', url: 'https://www.netacad.com/courses', kind: 'course', meta: 'Cisco' } },
  { re: /google cloud|gcp|skills boost/i, link: { label: 'Course', title: 'Google Cloud Skills Boost catalog', url: 'https://www.cloudskillsboost.google/catalog', kind: 'course', meta: 'Google Cloud' } },
  { re: /kubernetes|cncf|linux foundation/i, link: { label: 'Course', title: 'Introduction to Kubernetes (LFS158, free)', url: 'https://training.linuxfoundation.org/training/introduction-to-kubernetes/', kind: 'course', meta: 'Linux Foundation' } },
];

export interface TaskIn { title: string; kind: string; resource: string; query?: string }

export async function resolveTask(env: Env, t: TaskIn, role: string): Promise<Link[]> {
  const q = (t.query || t.title).replace(/\s+/g, ' ').trim().slice(0, 80);
  if (env.LLM_PROVIDER === 'mock') return [
    { label: 'Watch', title: `${q} tutorial`, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'video', meta: 'Mock · 10:00' },
    { label: 'Course', title: `${q} course`, url: 'https://www.coursera.org/learn/mock', kind: 'course', meta: 'Coursera' },
  ];
  if (t.kind === 'apply') return [
    { label: 'Jobs', title: `${role} jobs in Malaysia`, url: `https://www.linkedin.com/jobs/search/?keywords=${enc(role)}&location=Malaysia`, kind: 'jobs', meta: 'LinkedIn' },
    { label: 'Jobs', title: `${role} jobs`, url: `https://my.jobstreet.com/${enc(role.toLowerCase().replace(/\s+/g, '-'))}-jobs`, kind: 'jobs', meta: 'JobStreet' },
  ];
  const official = OFFICIAL.find(o => o.re.test(`${t.resource} ${q}`))?.link;
  const wantsMs = /microsoft|azure|ms learn|power bi|\.net|c#/i.test(`${t.resource} ${q}`);
  const [video, course] = await Promise.all([
    youtubeVideo(env, `${q} ${t.kind === 'build' ? 'project tutorial' : 'tutorial'}`),
    wantsMs ? msLearn(q) : (official ? Promise.resolve(official) : courseraCourse(q)),
  ]);
  const out = [video, course ?? official ?? null].filter(Boolean) as Link[];
  if (t.kind === 'build') out.push({ label: 'Examples', title: `Example ${q} projects`, url: `https://github.com/search?q=${enc(q)}&type=repositories&s=stars`, kind: 'practice', meta: 'GitHub, most starred' });
  return out;
}

/** Cached resolver: one lookup per unique query, kept 30 days. */
export async function resolveCached(env: Env, t: TaskIn, role: string): Promise<Link[]> {
  const key = `${t.kind}|${(t.query || t.title).toLowerCase().trim()}|${t.resource.toLowerCase().slice(0, 40)}`;
  const hit = await env.DB.prepare("SELECT links FROM resource_cache WHERE key=? AND created_at > datetime('now','-30 day')").bind(key).first<string>('links').catch(() => null);
  if (hit) return JSON.parse(hit);
  const links = await resolveTask(env, t, role);
  if (links.some(l => l.kind === 'video' || l.kind === 'course')) await env.DB.prepare('INSERT OR REPLACE INTO resource_cache (key,links) VALUES (?,?)').bind(key, JSON.stringify(links)).run().catch(() => {});
  return links;
}
