export interface User { id: string; name: string; email: string; role: string }
export interface Profile {
  user: User & { phone: string | null; location: string | null; headline: string | null; linkedin: string | null; github: string | null; website: string | null };
  education: { id: number; programme_id: number | null; institution: string; qualification: string; start_year: number | null; end_year: number | null; cgpa: number | null }[];
  subjects: { id: number; name: string; year: number | null; plo_codes: string[]; skills: string[] }[];
  skills: { id: number; name: string; category: string; level: number; source: string; evidence: string | null }[];
  experiences: { id: number; kind: string; title: string; organisation: string | null; start_date: string | null; end_date: string | null; description: string | null }[];
  certifications: { id: number; name: string; issuer: string | null; year: string | null; url: string | null }[];
}
export interface Competency {
  programmeId: number | null;
  plos: { code: string; domain: string; description: string; evidence: string[]; strength: number }[];
  covered: number; total: number; readiness: number; parts: Record<string, number>; next: string[];
}
export interface ResumeContent {
  name: string; headline: string;
  contact: { email?: string; phone?: string; location?: string; linkedin?: string; github?: string; website?: string };
  summary: string;
  skills: { group: string; items: string[] }[];
  experience: { title: string; org: string; period: string; bullets: string[] }[];
  projects: { title: string; org: string; period: string; bullets: string[] }[];
  education: { qualification: string; institution: string; period: string; details: string }[];
  certifications: { name: string; issuer: string; year: string }[];
  competencies: { code: string; domain: string; evidence: string }[];
}
export interface Job {
  id: string; title: string; company: string; location: string; remote: boolean; url: string; source: string;
  posted: string | null; salary: string | null; tags: string[]; description: string;
  fit: { score: number; matched: string[]; missing: string[] };
}
