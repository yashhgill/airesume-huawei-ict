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
    user: `Candidate profile:\n${profileBrief(p)}\n\nSuggest 5 entry-level job titles that fit, each with match 0-100, one-sentence why, matching skills (from the profile) and missing skills to learn, and a typical monthly salary range in MYR for fresh graduates in Malaysia. Then suggest 6 real, currently offered certifications that fit these roles, drawn from ANY provider (AWS, Microsoft, Google Cloud, Huawei, Cisco, CompTIA, Linux Foundation, Oracle, Red Hat, ISC2, Fortinet, HashiCorp, etc.) — do not favour any single vendor. Include at least 2 that are completely free to earn (e.g. free exams/badges such as ISC2 CC, Fortinet FCF/FCA, Cisco NetAcad badges, Google/Microsoft free skill badges) and mark the rest as paid with the approximate exam fee. Then a 4-step learning path.\nReturn {"roles":[{"title","match","why","matching":[],"missing":[],"salary_myr"}],"certifications":[{"name","provider","why","cost":"free|paid","price":"e.g. Free or USD 100","level":"beginner|associate|professional","hours":"typical prep hours","url":"official page"}],"learning_path":[{"step","resource"}]}`,
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

// ── Coach, interview practice and learning plans ────────────────────────────

export function coachSystem(p: Profile, extra: { plos: { code: string; domain: string; strength: number }[]; readiness: number; plan?: string | null; lastInterview?: string | null }) {
  const weak = extra.plos.filter(x => x.strength < 40).map(x => `${x.code} ${x.domain}`).join(', ') || 'none';
  return `You are Path, the career coach inside PathForward, talking with a Malaysian university student. You know their record:

${profileBrief(p)}

Employability readiness: ${extra.readiness}/100. Weak programme learning outcomes: ${weak}.
${extra.plan ? `Current learning plan: ${extra.plan}` : 'No learning plan yet.'}
${extra.lastInterview ? `Last mock interview: ${extra.lastInterview}` : ''}

How to coach:
- Be warm, direct and specific to THIS student. Refer to their actual subjects, skills and projects by name.
- Keep replies short: 2-5 sentences or a tight list. End with one concrete next step when it helps.
- Use Malaysian context (JobStreet, Hiredly, LinkedIn, MDEC, TalentCorp, typical fresh-graduate salaries in RM, entry-level certifications from any vendor, including free ones).
- Never invent facts about the student. If you need information, ask one question.
- When a PathForward feature fits, name it: Resumes, ATS check, Job search, Mock interview, Learning plan, Competency map.
- Plain text with simple markdown (bold, lists). No headings.`;
}

export async function interviewQuestions(env: Env, p: Profile, opts: { role: string; kind: string; job?: string }) {
  return llmJson<{ questions: { q: string; focus: string; tip: string }[] }>(env, {
    task: 'interview_questions', input: opts, temperature: 0.6, speed: 'smart',
    system: `You are an experienced Malaysian hiring manager running a graduate interview. Ask realistic questions a fresh graduate would face. ${HONEST}`,
    user: `Candidate profile:\n${profileBrief(p)}\n\nRole: ${opts.role}\nInterview style: ${opts.kind} (behavioural = situational STAR questions; technical = role knowledge and problem solving; mixed = both)\n${opts.job ? `Job advert:\n${clip(opts.job, 2000)}\n` : ''}\nWrite 5 questions in the order an interviewer would ask them, opening with an easy one. Make at least two refer to something specific in the candidate's own profile (a subject, project or skill). For each give the competency it tests (focus) and a one-line tip for answering.\nReturn {"questions":[{"q","focus","tip"}]}`,
  });
}

export interface AnswerFeedback { score: number; verdict: string; strengths: string[]; improve: string[]; better: string }

export async function gradeAnswer(env: Env, p: Profile, opts: { role: string; question: string; focus: string; answer: string }) {
  return llmJson<AnswerFeedback>(env, {
    task: 'grade_answer', input: opts, temperature: 0.3, speed: 'fast',
    system: `You are a fair, encouraging interview coach. Score answers like a real panel would for a fresh graduate. Use the STAR structure (Situation, Task, Action, Result) for behavioural questions. ${HONEST}`,
    user: `Role: ${opts.role}\nQuestion: ${opts.question}\nTests: ${opts.focus}\nCandidate's answer: ${clip(opts.answer, 3000)}\n\nCandidate background (for the improved answer, use only these facts):\n${clip(profileBrief(p), 2500)}\n\nReturn {"score":1-10,"verdict":"one sentence","strengths":["up to 3"],"improve":["up to 3 specific fixes"],"better":"a stronger version of THEIR answer in 80-120 words, first person, using only facts from their answer and background"}`,
  });
}

export interface PlanContent {
  summary: string;
  role: string;
  certification?: { name: string; why: string };
  weeks: { week: number; theme: string; tasks: { title: string; kind: 'learn' | 'build' | 'certify' | 'apply' | 'practice'; resource: string; minutes: number; done?: boolean }[] }[];
}

export async function learningPlan(env: Env, p: Profile, opts: { role: string; weeks: number; hours: number; gaps: string[]; cert?: string }) {
  return llmJson<PlanContent>(env, {
    task: 'plan', input: opts, temperature: 0.4, maxTokens: 3000, speed: 'smart',
    system: `You design realistic self-study plans for Malaysian university students juggling classes. Prefer free, well-known resources (official vendor training such as AWS Skill Builder, Microsoft Learn, Google Cloud Skills Boost, Huawei Talent, Cisco NetAcad; freeCodeCamp, Coursera audit, official documentation, YouTube channels) and name them exactly. ${HONEST}`,
    user: `Candidate profile:\n${profileBrief(p)}\n\nTarget role: ${opts.role}\nKnown gaps: ${opts.gaps.join(', ') || 'work them out from the profile'}\nDuration: ${opts.weeks} weeks, about ${opts.hours} hours per week.\n\nBuild a week-by-week plan that closes the gaps and ends with something the student can show (a project, a certification, applications sent). 3-4 tasks per week; minutes per task must add up to roughly the weekly hours. kinds: learn, build, practice, certify, apply. Include one portfolio project built across several weeks and ${opts.cert ? `prepares for the certification the student chose: ${opts.cert}` : 'where it fits, the single best-fit certification from any vendor (prefer a free one if it is equally useful)'}.\nReturn {"summary":"2 sentences","role":"${opts.role}","certification":{"name","why"},"weeks":[{"week":1,"theme","tasks":[{"title","kind","resource","minutes"}]}]}`,
  });
}
