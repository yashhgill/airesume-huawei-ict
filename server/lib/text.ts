/** Deterministic text helpers: skill normalisation and keyword matching.
 *  Used for instant job matching and ATS keyword checks without an LLM call. */

const ALIASES: Record<string, string[]> = {
  'javascript': ['js', 'ecmascript'],
  'typescript': ['ts'],
  'node.js': ['nodejs', 'node'],
  'react': ['react.js', 'reactjs'],
  'kubernetes': ['k8s'],
  'ci/cd': ['cicd', 'continuous integration', 'continuous delivery'],
  'sql': ['mysql', 'postgresql', 'postgres', 'sqlite'],
  'cloud computing': ['cloud', 'aws', 'azure', 'gcp', 'huawei cloud'],
  'machine learning': ['ml'],
  'artificial intelligence': ['ai'],
  'linux': ['unix', 'ubuntu'],
  'rest apis': ['rest', 'restful', 'api'],
  'html/css': ['html', 'css'],
  'agile/scrum': ['agile', 'scrum'],
  'ui/ux design': ['ui', 'ux', 'user experience'],
};

export const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function variants(skill: string): string[] {
  const n = norm(skill);
  const out = new Set([n]);
  for (const [k, vs] of Object.entries(ALIASES)) {
    if (k === n || vs.includes(n)) { out.add(k); vs.forEach(v => out.add(v)); }
  }
  n.split('/').forEach(p => p.length > 1 && out.add(p.trim()));
  return [...out];
}

function contains(haystack: string, needle: string) {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#])${esc}($|[^a-z0-9+#])`, 'i').test(haystack);
}

export function skillInText(skill: string, text: string) {
  const t = text.toLowerCase();
  return variants(skill).some(v => v.length > 1 && contains(t, v));
}

/** Common tech keywords we look for in job descriptions. */
export const KEYWORDS = [
  'Python', 'Java', 'JavaScript', 'TypeScript', 'Go', 'C#', 'C++', 'PHP', 'Kotlin', 'Swift', 'SQL', 'NoSQL', 'MongoDB',
  'React', 'Angular', 'Vue', 'Node.js', 'Django', 'Flask', 'Spring', 'Laravel', '.NET', 'Flutter',
  'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'CI/CD', 'Git', 'Jenkins', 'GitHub Actions', 'Linux', 'Bash',
  'AWS', 'Azure', 'GCP', 'Huawei Cloud', 'Serverless', 'Microservices', 'REST APIs', 'GraphQL',
  'Machine Learning', 'Deep Learning', 'NLP', 'TensorFlow', 'PyTorch', 'Data Analytics', 'Power BI', 'Tableau', 'Excel',
  'Networking', 'TCP/IP', 'Security', 'IAM', 'SIEM', 'Penetration Testing',
  'Agile/Scrum', 'Jira', 'UI/UX Design', 'Figma', 'Testing', 'Communication', 'Teamwork', 'Leadership', 'Problem Solving',
];

export function extractKeywords(text: string, extra: string[] = []) {
  const found = new Set<string>();
  for (const k of [...KEYWORDS, ...extra]) if (skillInText(k, text)) found.add(k);
  return [...found];
}

/** Overlap between a person's skills and a job text → 0..100. */
export function quickMatch(skills: string[], jobText: string) {
  const wanted = extractKeywords(jobText);
  const have = skills.filter(s => skillInText(s, jobText));
  const matched = wanted.filter(w => skills.some(s => variants(s).some(v => variants(w).includes(v))));
  const matchedAll = [...new Set([...matched, ...have])];
  const missing = wanted.filter(w => !matchedAll.some(m => variants(m).some(v => variants(w).includes(v))));
  const denom = Math.max(wanted.length, 4);
  const score = Math.round(Math.min(1, matchedAll.length / denom) * 100);
  return { score, matched: matchedAll.slice(0, 12), missing: missing.slice(0, 10) };
}

export const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);
export const stripHtml = (s: string) => s.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
