/** Turns a plan task's resource name into real links. Search links are used so they never go stale or 404. */
export interface Res { label: string; url: string; kind: 'course' | 'video' | 'docs' | 'practice' | 'jobs' }
const enc = encodeURIComponent;
const g = (q: string, site?: string) => `https://www.google.com/search?q=${enc(site ? `site:${site} ${q}` : q)}`;

const PROVIDERS: { re: RegExp; label: string; kind: Res['kind']; url: (q: string) => string }[] = [
  { re: /microsoft learn|azure|ms learn/i, label: 'Microsoft Learn', kind: 'course', url: q => `https://learn.microsoft.com/en-us/search/?terms=${enc(q)}` },
  { re: /aws|skill ?builder|amazon/i, label: 'AWS Skill Builder', kind: 'course', url: q => g(q, 'skillbuilder.aws') },
  { re: /google cloud|skills boost|qwiklabs|gcp/i, label: 'Google Cloud Skills Boost', kind: 'course', url: q => `https://www.cloudskillsboost.google/catalog?keywords=${enc(q)}` },
  { re: /huawei/i, label: 'Huawei Talent', kind: 'course', url: q => g(q, 'e.huawei.com/en/talent') },
  { re: /coursera/i, label: 'Coursera (audit free)', kind: 'course', url: q => `https://www.coursera.org/search?query=${enc(q)}` },
  { re: /freecodecamp|fcc/i, label: 'freeCodeCamp', kind: 'course', url: q => `https://www.freecodecamp.org/news/search/?query=${enc(q)}` },
  { re: /netacad|cisco/i, label: 'Cisco NetAcad', kind: 'course', url: q => g(q, 'netacad.com') },
  { re: /udemy/i, label: 'Udemy', kind: 'course', url: q => `https://www.udemy.com/courses/search/?q=${enc(q)}` },
  { re: /kaggle/i, label: 'Kaggle Learn', kind: 'practice', url: q => g(q, 'kaggle.com/learn') },
  { re: /leetcode|hackerrank/i, label: 'HackerRank', kind: 'practice', url: () => 'https://www.hackerrank.com/domains' },
  { re: /linux foundation|kubernetes|cncf/i, label: 'Linux Foundation (free courses)', kind: 'course', url: q => g(q, 'training.linuxfoundation.org') },
  { re: /github/i, label: 'GitHub examples', kind: 'practice', url: q => `https://github.com/search?q=${enc(q)}&type=repositories` },
  { re: /youtube/i, label: 'YouTube', kind: 'video', url: q => `https://www.youtube.com/results?search_query=${enc(q)}` },
  { re: /docs|documentation/i, label: 'Official docs', kind: 'docs', url: q => g(`${q} official documentation`) },
  { re: /jobstreet/i, label: 'JobStreet', kind: 'jobs', url: q => `https://my.jobstreet.com/${enc(q.replace(/\s+/g, '-'))}-jobs` },
];

export function resourcesFor(t: { title: string; kind: string; resource: string; query?: string }, role?: string): Res[] {
  const q = (t.query || t.title).replace(/[^\w\s+#.-]/g, ' ').replace(/\s+/g, ' ').trim();
  const out: Res[] = [];
  for (const p of PROVIDERS) if (p.re.test(t.resource) && !out.some(o => o.label === p.label)) out.push({ label: p.label, url: p.url(q), kind: p.kind });
  if (t.kind === 'apply') {
    const r = role || q;
    out.push({ label: 'JobStreet', url: `https://my.jobstreet.com/${enc(r.replace(/\s+/g, '-'))}-jobs`, kind: 'jobs' });
    out.push({ label: 'LinkedIn Jobs', url: `https://www.linkedin.com/jobs/search/?keywords=${enc(r)}&location=Malaysia`, kind: 'jobs' });
    return out.slice(0, 3);
  }
  if (t.kind === 'certify') out.push({ label: 'Official exam page', url: g(`${q} certification exam official`), kind: 'docs' });
  if (t.kind === 'build' && !out.some(o => o.url.includes('github.com'))) out.push({ label: 'Example projects', url: `https://github.com/search?q=${enc(q)}&type=repositories`, kind: 'practice' });
  if (!out.some(o => o.kind === 'video')) out.push({ label: 'Video tutorial', url: `https://www.youtube.com/results?search_query=${enc(q + ' tutorial')}`, kind: 'video' });
  if (!out.some(o => o.kind === 'course')) out.push({ label: 'Free course', url: `https://www.coursera.org/search?query=${enc(q)}&productDifficultyLevel=Beginner`, kind: 'course' });
  return out.slice(0, 3);
}
