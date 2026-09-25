/** All AI tasks. Prompts insist on using only the facts supplied, so the model
 *  rewrites and organises the student's real record instead of inventing one. */
import type { Env } from './env';
import { llmJson } from './llm';
import { profileBrief, type Profile } from './profile';
import { clip } from './text';

export interface ResumeContent {
  name: string;
  headline: string;
  contact: { email?: string; phone?: string; location?: string; linkedin?: string; github?: string; website?: string };
  summary: string;
  skills: { group: string; items: string[] }[];
  experience: { title: string; org: string; period: string; bullets: string[] }[];
  projects: { title: string; org: string; period: string; bullets: string[] }[];
  education: { qualification: string; institution: string; period: string; details: string }[];
  certifications: { name: string; issuer: string; year: string }[];
  competencies: { code: string; domain: string; evidence: string }[];
}

const HONEST = `Rules: use ONLY facts from the candidate profile. Never invent employers, dates, grades, metrics, certifications or technologies. You may rephrase, reorder, group and tighten wording. If information is missing, leave it out.`;

export interface JobLite { title: string; company?: string; location?: string; description: string }

export async function inferSkills(env: Env, p: Profile) {
  const input = { subjects: p.subjects.map(s => ({ name: s.name, clos: s.clos, skills: s.skills })), experiences: p.experiences.map(x => `${x.title}: ${x.description ?? ''}`), existing: p.skills.map(s => s.name) };
  return llmJson<{ skills: { name: string; category: 'Technical' | 'Tool' | 'Soft' | 'Language'; level: number; evidence: string }[] }>(env, {
    task: 'infer_skills', input, temperature: 0.2,
    system: `You are a university career advisor mapping course learning outcomes (CLOs) to employable skills. ${HONEST}`,
    user: `From these completed subjects (with CLOs) and experiences, list up to 20 concrete skills an employer would search for. For each give category (Technical, Tool, Soft or Language), level 1-5 (1=aware, 3=can apply, 5=expert; students rarely exceed 4) and evidence naming the subject or experience. Skip skills already listed.\n\n${JSON.stringify(input)}\n\nReturn {"skills":[{"name","category","level","evidence"}]}`,
  });
}

export async function careerInsights(env: Env, p: Profile) {
  return llmJson<{ roles: { title: string; match: number; why: string; matching: string[]; missing: string[]; salary_myr: string }[]; certifications: { name: string; provider: string; why: string }[]; learning_path: { step: string; resource: string }[] }>(env, {
    task: 'career', input: p, temperature: 0.3,
    system: `You are a Malaysian graduate career advisor. Be realistic about entry-level roles in Malaysia. ${HONEST}`,
    user: `Candidate profile:\n${profileBrief(p)}\n\nSuggest 5 entry-level job titles that fit, each with match 0-100, one-sentence why, matching skills (from the profile) and missing skills to learn, and a typical monthly salary range in MYR for fresh graduates in Malaysia. Then suggest 3 certifications (prefer Huawei HCIA/HCIP where relevant, plus vendor-neutral options) and a 4-step learning path.\nReturn {"roles":[{"title","match","why","matching":[],"missing":[],"salary_myr"}],"certifications":[{"name","provider","why"}],"learning_path":[{"step","resource"}]}`,
  });
}

export async function generateResume(env: Env, p: Profile, opts: { targetRole: string; tone: string; job?: JobLite; plos: { code: string; domain: string; evidence: string[] }[] }) {
  const jobPart = opts.job ? `\nTailor it to this job (mirror its keywords where the profile genuinely supports them):\n${opts.job.title} at ${opts.job.company ?? ''}\n${clip(opts.job.description, 2500)}` : '';
  const out = await llmJson<Omit<ResumeContent, 'name' | 'contact' | 'education' | 'certifications' | 'competencies'> & { competencies?: ResumeContent['competencies'] }>(env, {
    task: 'resume', input: { p, opts }, temperature: 0.35, maxTokens: 2500,
    system: `You are an expert resume writer for Malaysian graduates, writing ATS-friendly resumes. ${HONEST} Bullets start with a strong verb and are under 25 words.`,
    user: `Candidate profile:\n${profileBrief(p)}\n\nProgramme learning outcomes with evidence:\n${opts.plos.filter(x => x.evidence.length).map(x => `${x.code} ${x.domain}: ${x.evidence.join(', ')}`).join('\n')}\n\nWrite a one-page resume for the target role "${opts.targetRole}" in a ${opts.tone} tone.${jobPart}\n\nReturn {"headline":"short professional title","summary":"3 sentences","skills":[{"group","items":[]}],"experience":[{"title","org","period","bullets":[]}],"projects":[{"title","org","period","bullets":[]}],"competencies":[{"code","domain","evidence":"one line"}]}\nPut work, internships and activities under experience; academic/personal projects under projects. Choose the 4 strongest competencies.`,
  });
  const content: ResumeContent = {
    name: p.user.name,
    headline: out.headline || opts.targetRole,
    contact: { email: p.user.email, phone: p.user.phone ?? undefined, location: p.user.location ?? undefined, linkedin: p.user.linkedin ?? undefined, github: p.user.github ?? undefined, website: p.user.website ?? undefined },
    summary: out.summary ?? '',
    skills: out.skills ?? [],
    experience: out.experience ?? [],
    projects: out.projects ?? [],
    education: p.education.map(e => ({ qualification: e.qualification, institution: e.institution, period: `${e.start_year ?? ''}–${e.end_year ?? 'Present'}`, details: [e.cgpa ? `CGPA ${e.cgpa.toFixed(2)}` : '', p.subjects.length ? `Relevant subjects: ${p.subjects.slice(-6).map(s => s.name).join(', ')}` : ''].filter(Boolean).join(' · ') })),
    certifications: p.certifications.map(c => ({ name: c.name, issuer: c.issuer ?? '', year: c.year ?? '' })),
    competencies: out.competencies ?? [],
  };
  return content;
}

export async function atsReview(env: Env, resume: ResumeContent, jd: string, keyword: { matched: string[]; missing: string[] }) {
  return llmJson<{ score: number; verdict: string; strengths: string[]; gaps: string[]; rewrites: { before: string; after: string }[] }>(env, {
    task: 'ats', input: { resume, jd, keyword }, temperature: 0.2,
    system: `You are an ATS (applicant tracking system) and a senior recruiter reviewing a resume against a job description. Be specific and constructive. ${HONEST}`,
    user: `JOB DESCRIPTION:\n${clip(jd, 3000)}\n\nRESUME (JSON):\n${clip(JSON.stringify(resume), 5000)}\n\nKeyword scan: matched ${keyword.matched.join(', ') || 'none'}; missing ${keyword.missing.join(', ') || 'none'}.\n\nScore 0-100 for fit, give a one-sentence verdict, 3 strengths, up to 5 gaps, and up to 3 bullet rewrites (quote an existing bullet or summary line as "before"; the "after" may only use facts already in the resume).\nReturn {"score","verdict","strengths":[],"gaps":[],"rewrites":[{"before","after"}]}`,
  });
}

export async function coverLetter(env: Env, p: Profile, job: JobLite, tone: string) {
  return llmJson<{ subject: string; body: string }>(env, {
    task: 'cover_letter', input: { p, job }, temperature: 0.5,
    system: `You write concise, warm cover letters for Malaysian fresh graduates. 250-320 words, 4 paragraphs, no clichés like "I am writing to express". ${HONEST}`,
    user: `Candidate profile:\n${profileBrief(p)}\n\nJob: ${job.title} at ${job.company ?? 'the company'} (${job.location ?? ''})\n${clip(job.description, 2500)}\n\nTone: ${tone}. Return {"subject":"email subject line","body":"the letter with \\n\\n between paragraphs, signed with the candidate's name"}`,
  });
}

export async function jobFit(env: Env, p: Profile, job: JobLite) {
  return llmJson<{ score: number; summary: string; matched: string[]; missing: string[]; advice: string[] }>(env, {
    task: 'job_fit', input: { p, job }, temperature: 0.2,
    system: `You assess how well a graduate fits a job, honestly. ${HONEST}`,
    user: `Candidate profile:\n${profileBrief(p)}\n\nJob: ${job.title} at ${job.company ?? ''}\n${clip(job.description, 3000)}\n\nReturn {"score":0-100,"summary":"2 sentences","matched":["requirements the candidate meets"],"missing":["requirements not evidenced"],"advice":["3 concrete things to do before applying"]}`,
  });
}

export async function parseResumeText(env: Env, text: string) {
  return llmJson<{ name?: string; phone?: string; location?: string; headline?: string; linkedin?: string; github?: string; education: { qualification: string; institution: string; start_year?: number; end_year?: number; cgpa?: number }[]; skills: { name: string; category: string }[]; experiences: { kind: string; title: string; organisation?: string; start_date?: string; end_date?: string; description?: string }[]; certifications: { name: string; issuer?: string; year?: string }[] }>(env, {
    task: 'parse_resume', input: text, temperature: 0,
    system: `You extract structured data from resume text. Copy facts exactly; do not guess missing values.`,
    user: `RESUME TEXT:\n${clip(text, 9000)}\n\nReturn {"name","phone","location","headline","linkedin","github","education":[{"qualification","institution","start_year","end_year","cgpa"}],"skills":[{"name","category":"Technical|Tool|Soft|Language"}],"experiences":[{"kind":"work|internship|project|activity","title","organisation","start_date","end_date","description"}],"certifications":[{"name","issuer","year"}]}`,
  });
}
