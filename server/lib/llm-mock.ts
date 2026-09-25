/**
 * Offline stand-in for the LLM, used ONLY when LLM_PROVIDER=mock (automated
 * tests and CI without an API key). It builds plausible output from the input
 * so every route can be exercised end-to-end without network access.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function mockLlm(task: string, input: any): unknown {
  switch (task) {
    case 'infer_skills':
      return { skills: [{ name: 'Teamwork', category: 'Soft', level: 3, evidence: 'Group projects' }, { name: 'Technical Writing', category: 'Soft', level: 3, evidence: 'Final Year Project' }] };
    case 'career':
      return { roles: [{ title: 'Cloud Support Engineer', match: 78, why: 'Strong cloud and Linux coursework.', matching: ['Cloud Computing', 'Linux'], missing: ['Terraform'], salary_myr: 'RM 3,500 – 4,500' }], certifications: [{ name: 'HCIA-Cloud Computing', provider: 'Huawei', why: 'Validates cloud fundamentals.' }], learning_path: [{ step: 'Build and deploy a serverless API', resource: 'Cloudflare Workers docs' }] };
    case 'resume': {
      const p = input.p;
      return {
        headline: input.opts.targetRole,
        summary: `${p.user.name} is a graduate targeting ${input.opts.targetRole} roles.`,
        skills: [{ group: 'Technical', items: p.skills.map((s: any) => s.name).slice(0, 8) }],
        experience: p.experiences.filter((x: any) => x.kind !== 'project').map((x: any) => ({ title: x.title, org: x.organisation ?? '', period: `${x.start_date ?? ''}–${x.end_date ?? 'Present'}`, bullets: [x.description ?? ''] })),
        projects: p.experiences.filter((x: any) => x.kind === 'project').map((x: any) => ({ title: x.title, org: x.organisation ?? '', period: '', bullets: [x.description ?? ''] })),
        competencies: input.opts.plos.filter((x: any) => x.evidence.length).slice(0, 4).map((x: any) => ({ code: x.code, domain: x.domain, evidence: x.evidence.join(', ') })),
      };
    }
    case 'ats': return { score: 70, verdict: 'Good fit with a few gaps.', strengths: input.keyword.matched.slice(0, 3), gaps: input.keyword.missing.slice(0, 3), rewrites: [] };
    case 'cover_letter': return { subject: `Application: ${input.job.title}`, body: `Dear Hiring Manager,\n\nI am applying for ${input.job.title}.\n\nRegards,\n${input.p.user.name}` };
    case 'job_fit': return { score: 65, summary: 'Reasonable fit.', matched: ['Cloud Computing'], missing: ['3 years experience'], advice: ['Build a project'] };
    case 'parse_resume': return { name: 'Imported Name', education: [{ qualification: 'Diploma in IT', institution: 'Politeknik Melaka', start_year: 2019, end_year: 2021 }], skills: [{ name: 'Python', category: 'Technical' }], experiences: [{ kind: 'internship', title: 'IT Intern', organisation: 'Acme Sdn Bhd', start_date: '2021-03', end_date: '2021-08', description: 'Supported helpdesk tickets.' }], certifications: [] };
    default: return {};
  }
}
