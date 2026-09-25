import type { Env } from './env';

export interface Profile {
  user: { id: string; name: string; email: string; phone: string | null; location: string | null; headline: string | null; linkedin: string | null; github: string | null; website: string | null; role: string };
  education: { id: number; programme_id: number | null; institution: string; qualification: string; start_year: number | null; end_year: number | null; cgpa: number | null; notes: string | null }[];
  subjects: { id: number; name: string; code: string | null; year: number | null; clos: string[]; plo_codes: string[]; skills: string[]; grade: string | null }[];
  skills: { id: number; name: string; category: string; level: number; source: string; evidence: string | null }[];
  experiences: { id: number; kind: string; title: string; organisation: string | null; start_date: string | null; end_date: string | null; description: string | null }[];
  certifications: { id: number; name: string; issuer: string | null; year: string | null; url: string | null }[];
}

const J = <T>(s: unknown, d: T): T => { try { return s ? JSON.parse(String(s)) as T : d; } catch { return d; } };

export async function loadProfile(env: Env, userId: string): Promise<Profile> {
  const db = env.DB;
  const [user, edu, subs, skills, exps, certs] = await Promise.all([
    db.prepare('SELECT id,name,email,phone,location,headline,linkedin,github,website,role FROM users WHERE id=?').bind(userId).first<Profile['user']>(),
    db.prepare('SELECT id,programme_id,institution,qualification,start_year,end_year,cgpa,notes FROM education WHERE user_id=? ORDER BY COALESCE(end_year,9999) DESC').bind(userId).all<Profile['education'][number]>(),
    db.prepare('SELECT s.id,s.name,s.code,s.year,s.clos,s.plo_codes,s.skills,us.grade FROM user_subjects us JOIN subjects s ON s.id=us.subject_id WHERE us.user_id=? ORDER BY s.year,s.name').bind(userId).all<Record<string, unknown>>(),
    db.prepare('SELECT id,name,category,level,source,evidence FROM skills WHERE user_id=? ORDER BY level DESC,name').bind(userId).all<Profile['skills'][number]>(),
    db.prepare('SELECT id,kind,title,organisation,start_date,end_date,description FROM experiences WHERE user_id=? ORDER BY sort_order, COALESCE(end_date,\'9999\') DESC').bind(userId).all<Profile['experiences'][number]>(),
    db.prepare('SELECT id,name,issuer,year,url FROM certifications WHERE user_id=? ORDER BY year DESC').bind(userId).all<Profile['certifications'][number]>(),
  ]);
  if (!user) throw new Error('user not found');
  return {
    user,
    education: edu.results,
    subjects: subs.results.map(r => ({
      id: Number(r.id), name: String(r.name), code: (r.code as string) ?? null, year: (r.year as number) ?? null,
      clos: J<string[]>(r.clos, []), plo_codes: J<string[]>(r.plo_codes, []), skills: J<string[]>(r.skills, []), grade: (r.grade as string) ?? null,
    })),
    skills: skills.results,
    experiences: exps.results,
    certifications: certs.results,
  };
}

/** Compact text version of the profile for LLM prompts (facts only). */
export function profileBrief(p: Profile) {
  const lines: string[] = [];
  lines.push(`Name: ${p.user.name}`);
  if (p.user.headline) lines.push(`Headline: ${p.user.headline}`);
  if (p.user.location) lines.push(`Location: ${p.user.location}`);
  for (const e of p.education) lines.push(`Education: ${e.qualification}, ${e.institution} (${e.start_year ?? '?'}–${e.end_year ?? 'present'})${e.cgpa ? `, CGPA ${e.cgpa}` : ''}`);
  if (p.subjects.length) lines.push(`Subjects taken: ${p.subjects.map(s => s.name).join('; ')}`);
  if (p.skills.length) lines.push(`Skills: ${p.skills.map(s => `${s.name} (${s.category}, level ${s.level}/5)`).join('; ')}`);
  for (const x of p.experiences) lines.push(`${x.kind.toUpperCase()}: ${x.title}${x.organisation ? ` at ${x.organisation}` : ''} (${x.start_date ?? ''}–${x.end_date ?? 'present'}): ${x.description ?? ''}`);
  for (const c of p.certifications) lines.push(`Certification: ${c.name}${c.issuer ? ` — ${c.issuer}` : ''}${c.year ? ` (${c.year})` : ''}`);
  return lines.join('\n');
}

/** PLO coverage + employability readiness, computed without AI. */
export async function competency(env: Env, p: Profile) {
  const programmeId = p.education.find(e => e.programme_id)?.programme_id ?? null;
  const plos = programmeId
    ? (await env.DB.prepare('SELECT code,domain,description FROM plos WHERE programme_id=? ORDER BY sort_order').bind(programmeId).all<{ code: string; domain: string; description: string }>()).results
    : [];
  const coverage = plos.map(plo => {
    const subjects = p.subjects.filter(s => s.plo_codes.includes(plo.code)).map(s => s.name);
    const expEvidence = p.experiences.filter(x => ploFromExperience(plo.domain, x)).map(x => x.title);
    const evidence = [...subjects, ...expEvidence];
    const strength = Math.min(100, subjects.length * 34 + expEvidence.length * 25);
    return { ...plo, evidence, strength };
  });
  const covered = coverage.filter(c => c.strength > 0).length;

  const parts = {
    profile: [p.user.phone, p.user.location, p.user.headline, p.user.linkedin || p.user.github].filter(Boolean).length / 4,
    education: p.education.length ? 1 : 0,
    subjects: Math.min(1, p.subjects.length / 8),
    skills: Math.min(1, p.skills.length / 12),
    experience: Math.min(1, p.experiences.length / 3),
    certifications: Math.min(1, p.certifications.length / 2),
  };
  const weights = { profile: 10, education: 15, subjects: 20, skills: 25, experience: 20, certifications: 10 };
  const readiness = Math.round(Object.entries(parts).reduce((s, [k, v]) => s + v * weights[k as keyof typeof weights], 0));
  const next: string[] = [];
  if (!p.education.length) next.push('Add your programme so Nova can map your subjects to learning outcomes.');
  if (p.subjects.length < 8) next.push('Tick the subjects you have completed to evidence more PLOs.');
  if (p.skills.length < 12) next.push('Generate skills from your subjects, then add tools you have used.');
  if (p.experiences.length < 3) next.push('Add internships, projects or club roles; they evidence teamwork and leadership PLOs.');
  if (!p.certifications.length) next.push('Add a certification (e.g. Huawei HCIA-Cloud) to stand out.');
  return { programmeId, plos: coverage, covered, total: plos.length, readiness, parts, next };
}

function ploFromExperience(domain: string, x: Profile['experiences'][number]) {
  const t = `${x.title} ${x.description ?? ''}`.toLowerCase();
  switch (domain) {
    case 'Interpersonal': return /team|collaborat|member/.test(t);
    case 'Leadership': return /lead|president|head|captain|manag|organis|organiz/.test(t);
    case 'Communication': return /present|report|write|document|pitch|communicat/.test(t);
    case 'Practical': return x.kind === 'internship' || x.kind === 'project' || /built|develop|deploy|implement/.test(t);
    case 'Entrepreneurial': return /founder|startup|business|freelanc|client/.test(t);
    case 'Digital': return /data|dashboard|cloud|digital|automat/.test(t);
    default: return false;
  }
}
