import type { ResumeContent } from '../lib/types';

/** A4 resume in one of three templates. Also what gets printed to PDF. */
export function ResumeView({ r, template }: { r: ResumeContent; template: string }) {
  const hidden = new Set(r.hidden ?? []);
  const on = (k: string) => !hidden.has(k);
  const contact = [r.contact.email, r.contact.phone, r.contact.location, r.contact.linkedin, r.contact.github, r.contact.website].filter(Boolean);
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="cv__sec"><h2>{title}</h2>{children}</section>;
  const Entries = ({ list }: { list: ResumeContent['experience'] }) => (
    <>{list.map((x, i) => (
      <div key={i} className="cv__entry">
        <div className="cv__row"><b>{x.title}</b><span>{x.period}</span></div>
        {x.org && <div className="cv__org">{x.org}</div>}
        {x.bullets.some(b => b.trim()) && <ul>{x.bullets.filter(b => b.trim()).map((b, j) => <li key={j}>{b}</li>)}</ul>}
      </div>
    ))}</>
  );
  const awards = (r.awards ?? []).filter(a => a.trim());
  const langs = (r.languages ?? []).filter(a => a.trim());
  const skillGroups = r.skills.filter(s => s.items.some(i => i.trim()));

  const skills = on('skills') && skillGroups.length > 0 ? (
    <Section title="Skills">
      <dl className="cv__skills">{skillGroups.map((s, i) => <div key={i}><dt>{s.group}</dt><dd>{s.items.filter(x => x.trim()).join(' · ')}</dd></div>)}</dl>
    </Section>
  ) : null;

  const main = (
    <>
      {on('summary') && r.summary.trim() && <Section title="Profile"><p>{r.summary}</p></Section>}
      {on('experience') && r.experience.length > 0 && <Section title="Experience"><Entries list={r.experience} /></Section>}
      {on('projects') && r.projects.length > 0 && <Section title="Projects"><Entries list={r.projects} /></Section>}
      {on('education') && r.education.length > 0 && (
        <Section title="Education">
          {r.education.map((e, i) => <div key={i} className="cv__entry"><div className="cv__row"><b>{e.qualification}</b><span>{e.period}</span></div><div className="cv__org">{e.institution}</div>{e.details && <p className="cv__small">{e.details}</p>}</div>)}
        </Section>
      )}
    </>
  );

  const side = (
    <>
      {skills}
      {on('awards') && awards.length > 0 && <Section title="Awards"><ul className="cv__plain">{awards.map((a, i) => <li key={i}>{a}</li>)}</ul></Section>}
      {on('certifications') && r.certifications.length > 0 && <Section title="Certifications"><ul className="cv__plain">{r.certifications.map((c, i) => <li key={i}><b>{c.name}</b>{[c.issuer, c.year].filter(Boolean).length ? ` — ${[c.issuer, c.year].filter(Boolean).join(', ')}` : ''}</li>)}</ul></Section>}
      {on('competencies') && r.competencies.length > 0 && (
        <Section title="Competencies">
          <ul className="cv__comp">{r.competencies.map((c, i) => <li key={i}><b>{c.domain}</b><span>{c.evidence}</span></li>)}</ul>
        </Section>
      )}
      {on('languages') && langs.length > 0 && <Section title="Languages"><p className="cv__small">{langs.join(' · ')}</p></Section>}
    </>
  );

  return (
    <article className={`cv cv--${template}`}>
      <header className="cv__head">
        <h1>{r.name}</h1>
        {r.headline && <p className="cv__headline">{r.headline}</p>}
        <p className="cv__contact">{contact.join('  ·  ')}</p>
      </header>
      {template === 'modern' ? <div className="cv__cols"><div>{main}</div><aside>{side}</aside></div> : <>{main}{side}</>}
    </article>
  );
}
