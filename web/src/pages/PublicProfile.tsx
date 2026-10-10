import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, BadgeCheck, BookOpen, Briefcase, Github, Globe, GraduationCap, Linkedin, MapPin } from 'lucide-react';
import { api } from '../lib/api';
import { Brand } from '../App';
import { Score } from '../components/ui';

interface Pub {
  name: string; headline: string | null; location: string | null; avatar_url: string | null;
  links: { linkedin: string | null; github: string | null; website: string | null };
  education: { qualification: string; institution: string; start_year: number | null; end_year: number | null; cgpa: number | null }[];
  readiness: number;
  plos: { code: string; domain: string; strength: number; evidence: string[] }[];
  subjects: { name: string; code: string | null; year: number | null; skills: string[] }[];
  skills: { name: string; category: string; level: number; source: string; evidence: string | null }[];
  experiences: { kind: string; title: string; organisation: string | null; start_date: string | null; end_date: string | null; description: string | null }[];
  certifications: { name: string; issuer: string | null; year: string | null }[];
}

const href = (u: string) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
const period = (a: string | null, b: string | null) => [a, b ?? (a ? 'Present' : null)].filter(Boolean).join(' – ');

/** The page a recruiter lands on from the link on a student's resume. No sign-in needed. */
export function PublicProfile() {
  const { slug } = useParams();
  const [p, setP] = useState<Pub | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api<Pub>(`/public/${slug}`).then(d => { setP(d); document.title = `${d.name} · PathForward`; }).catch(e => setErr(e.message)); }, [slug]);

  const groups = useMemo(() => {
    const m = new Map<string, Pub['skills']>();
    p?.skills.forEach(s => m.set(s.category || 'Other', [...(m.get(s.category || 'Other') ?? []), s]));
    return [...m.entries()];
  }, [p]);
  const work = p?.experiences.filter(x => x.kind !== 'project') ?? [];
  const projects = p?.experiences.filter(x => x.kind === 'project') ?? [];
  const evidenced = p?.skills.filter(s => s.evidence).length ?? 0;

  if (err) return <div className="pub"><div className="pub__top"><Brand /></div><div className="pub__empty"><h1>Profile not available</h1><p className="muted">{err}</p><Link className="btn btn--primary" to="/">What is PathForward?</Link></div></div>;
  if (!p) return <div className="pub"><div className="pub__top"><Brand /></div><p className="muted center">Loading profile…</p></div>;

  return (
    <div className="pub">
      <div className="pub__top"><Brand /><Link className="btn btn--ghost btn--sm" to="/register">Make your own</Link></div>

      <header className="pub__hero">
        <div className="pub__id">
          {p.avatar_url ? <img className="pub__avatar" src={p.avatar_url} alt="" /> : <div className="pub__avatar pub__avatar--init" aria-hidden>{p.name.trim()[0]}</div>}
          <div>
            <h1>{p.name}</h1>
            {p.headline && <p className="pub__headline">{p.headline}</p>}
            <p className="pub__meta">
              {p.education[0] && <span><GraduationCap size={15} /> {p.education[0].qualification}, {p.education[0].institution}</span>}
              {p.location && <span><MapPin size={15} /> {p.location}</span>}
            </p>
            <div className="pub__links">
              {p.links.linkedin && <a className="btn btn--ghost btn--sm" href={href(p.links.linkedin)} target="_blank" rel="noreferrer"><Linkedin size={15} /> LinkedIn</a>}
              {p.links.github && <a className="btn btn--ghost btn--sm" href={href(p.links.github)} target="_blank" rel="noreferrer"><Github size={15} /> GitHub</a>}
              {p.links.website && <a className="btn btn--ghost btn--sm" href={href(p.links.website)} target="_blank" rel="noreferrer"><Globe size={15} /> Website</a>}
            </div>
          </div>
        </div>
        <div className="pub__score">
          <Score value={p.readiness} size={112} label="ready" />
          <p className="small muted">Career readiness, worked out from completed subjects, skills and experience.</p>
        </div>
      </header>

      <p className="pub__trust"><BadgeCheck size={18} /> <span><b>{evidenced} of {p.skills.length} skills</b> are backed by evidence: a university subject, a project, or a certification. Look for the source under each skill.</span></p>

      <div className="pub__grid">
        <div className="pub__main">
          {(work.length > 0 || projects.length > 0) && (
            <section className="pub__card">
              <h2><Briefcase size={18} /> Experience &amp; projects</h2>
              <ol className="pub__timeline">
                {[...work, ...projects].map((x, i) => (
                  <li key={i}>
                    <div className="row between"><b>{x.title}</b><span className="small muted">{period(x.start_date, x.end_date)}</span></div>
                    <span className="small muted">{[x.kind === 'project' ? 'Project' : x.kind[0].toUpperCase() + x.kind.slice(1), x.organisation].filter(Boolean).join(' · ')}</span>
                    {x.description && <p>{x.description}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {groups.length > 0 && (
            <section className="pub__card">
              <h2><BadgeCheck size={18} /> Skills with evidence</h2>
              {groups.map(([g, list]) => (
                <div key={g} className="pub__skillgroup">
                  <h3>{g}</h3>
                  <ul className="pub__skills">
                    {list.map(s => (
                      <li key={s.name}>
                        <div className="row between"><b>{s.name}</b><span className="pub__dots" aria-label={`Level ${s.level} of 5`}>{[1, 2, 3, 4, 5].map(n => <i key={n} className={n <= s.level ? 'on' : ''} />)}</span></div>
                        {s.evidence && <span className="small muted">From {s.evidence}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {p.plos.length > 0 && (
            <section className="pub__card">
              <h2><BookOpen size={18} /> Programme learning outcomes</h2>
              <p className="small muted">How far completed subjects cover the degree's accredited outcomes (MQA).</p>
              <ul className="pub__plos">
                {p.plos.map(x => (
                  <li key={x.code}>
                    <div className="row between"><span><b>{x.code}</b> {x.domain}</span><span className="small mono">{x.strength}%</span></div>
                    <div className="pub__bar"><span style={{ width: `${x.strength}%` }} /></div>
                    {x.evidence.length > 0 && <span className="small muted">{x.evidence.join(' · ')}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="pub__side">
          {p.education.length > 0 && (
            <section className="pub__card">
              <h2><GraduationCap size={18} /> Education</h2>
              <ul className="pub__list">{p.education.map((e, i) => <li key={i}><b>{e.qualification}</b><span className="small muted">{e.institution}{e.end_year ? ` · ${e.start_year ? `${e.start_year}–` : ''}${e.end_year}` : ''}{e.cgpa ? ` · CGPA ${Number(e.cgpa).toFixed(2)}` : ''}</span></li>)}</ul>
            </section>
          )}
          {p.certifications.length > 0 && (
            <section className="pub__card">
              <h2><Award size={18} /> Certifications</h2>
              <ul className="pub__list">{p.certifications.map((c, i) => <li key={i}><b>{c.name}</b><span className="small muted">{[c.issuer, c.year].filter(Boolean).join(' · ')}</span></li>)}</ul>
            </section>
          )}
          {p.subjects.length > 0 && (
            <section className="pub__card">
              <h2><BookOpen size={18} /> Subjects completed</h2>
              <div className="chips">{p.subjects.map(s => <span key={s.name} className="tag" title={s.skills.join(', ')}>{s.name}</span>)}</div>
            </section>
          )}
        </aside>
      </div>
      <footer className="pub__foot small muted">Profile published by {p.name.split(' ')[0]} on <Link to="/">PathForward</Link>. Skills are linked to the university subjects that taught them.</footer>
    </div>
  );
}
