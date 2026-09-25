import type { ResumeContent } from '../lib/types';

/** A4 resume in one of three templates. Also what gets printed to PDF. */
export function ResumeView({ r, template }: { r: ResumeContent; template: string }) {
  const contact = [r.contact.email, r.contact.phone, r.contact.location, r.contact.linkedin, r.contact.github, r.contact.website].filter(Boolean);
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="cv__sec"><h2>{title}</h2>{children}</section>;
  const Entries = ({ list }: { list: ResumeContent['experience'] }) => (
    <>{list.map((x, i) => (
      <div key={i} className="cv__entry">
        <div className="cv__row"><b>{x.title}</b><span>{x.period}</span></div>
        {x.org && <div className="cv__org">{x.org}</div>}
        <ul>{x.bullets.filter(Boolean).map((b, j) => <li key={j}>{b}</li>)}</ul>
      </div>
    ))}</>
  );

  const skills = r.skills.some(s => s.items.length > 0) ? (
    <Section title="Skills">
      <dl className="cv__skills">{r.skills.filter(s => s.items.length).map(s => <div key={s.group}><dt>{s.group}</dt><dd>{s.items.join(' · ')}</dd></div>)}</dl>
    </Section>
  ) : null;

  const main = (
    <>
      {r.summary && <Section title="Profile"><p>{r.summary}</p></Section>}
      {r.experience.length > 0 && <Section title="Experience"><Entries list={r.experience} /></Section>}
      {r.projects.length > 0 && <Section title="Projects"><Entries list={r.projects} /></Section>}
      {r.education.length > 0 && (
        <Section title="Education">
          {r.education.map((e, i) => <div key={i} className="cv__entry"><div className="cv__row"><b>{e.qualification}</b><span>{e.period}</span></div><div className="cv__org">{e.institution}</div>{e.details && <p className="cv__small">{e.details}</p>}</div>)}
        </Section>
      )}
    </>
  );

  const side = (
    <>
      {skills}
      {r.competencies.length > 0 && (
        <Section title="Competencies">
          <ul className="cv__comp">{r.competencies.map(c => <li key={c.code}><b>{c.domain}</b><span>{c.evidence}</span></li>)}</ul>
        </Section>
      )}
      {r.certifications.length > 0 && <Section title="Certifications"><ul className="cv__plain">{r.certifications.map(c => <li key={c.name}><b>{c.name}</b>{[c.issuer, c.year].filter(Boolean).length ? ` — ${[c.issuer, c.year].filter(Boolean).join(', ')}` : ''}</li>)}</ul></Section>}
    </>
  );

  return (
    <article className={`cv cv--${template}`}>
      <header className="cv__head">
        <h1>{r.name}</h1>
        <p className="cv__headline">{r.headline}</p>
        <p className="cv__contact">{contact.join('  ·  ')}</p>
      </header>
      {template === 'modern' ? <div className="cv__cols"><div>{main}</div><aside>{side}</aside></div> : <>{main}{side}</>}
    </article>
  );
}
