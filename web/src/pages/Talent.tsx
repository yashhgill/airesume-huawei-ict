import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Award, Bookmark, BookmarkCheck, ExternalLink, Github, GraduationCap, Linkedin, Mail, Phone, Search, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Card, Empty, Meter, Notice, PageHead, Spinner, Tag } from '../components/ui';

interface Cand {
  id: string; name: string; headline: string | null; location: string | null; avatar_url: string | null; programme: string | null; institution: string | null; grad_year: number | null; cgpa: number | null;
  readiness: number; covered: number; total: number; skills: string[]; certifications: string[]; best_interview: number | null;
  match?: number | null; matched?: string[]; stage?: string | null; note?: string | null; for_role?: string | null;
}

export const STAGES = [
  { id: 'shortlisted', label: 'Shortlisted' }, { id: 'contacted', label: 'Contacted' }, { id: 'interviewing', label: 'Interviewing' },
  { id: 'offered', label: 'Offered' }, { id: 'passed', label: 'Passed' },
];

export const Avatar = ({ c, size = 44 }: { c: { name: string; avatar_url?: string | null }; size?: number }) =>
  c.avatar_url ? <img className="avatar" src={c.avatar_url} alt="" style={{ width: size, height: size }} />
    : <span className="avatar" style={{ width: size, height: size, fontSize: size * .4 }}>{c.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}</span>;

export function CandidateCard({ c, onShortlist }: { c: Cand; onShortlist?: (c: Cand) => void }) {
  return (
    <article className="cand">
      <Link to={`/app/talent/${c.id}`} className="cand__main">
        <Avatar c={c} />
        <div className="cand__id">
          <b>{c.name}</b>
          <span>{c.headline || c.programme || 'Student'}</span>
          <span className="muted small">{[c.institution, c.grad_year && `Class of ${c.grad_year}`, c.location].filter(Boolean).join(' · ')}</span>
        </div>
        <div className="cand__score">
          {c.match != null ? <><b>{c.match}%</b><span>match</span></> : <><b>{c.readiness}</b><span>ready</span></>}
        </div>
      </Link>
      <div className="chips">
        {(c.matched ?? []).map(m => <Tag key={m} tone="ok">✓ {m}</Tag>)}
        {c.skills.filter(s => !(c.matched ?? []).some(m => s.toLowerCase().includes(m))).slice(0, 6).map(s => <Tag key={s}>{s}</Tag>)}
        {c.certifications.slice(0, 2).map(x => <Tag key={x} tone="info"><Award size={11} /> {x}</Tag>)}
      </div>
      <div className="cand__foot">
        <span className="muted small">{c.covered}/{c.total} outcomes · {c.best_interview != null ? `interview ${c.best_interview}` : 'no interview yet'}</span>
        {onShortlist && <button className={`btn btn--sm ${c.stage ? 'btn--ghost' : 'btn--primary'}`} onClick={() => onShortlist(c)}>{c.stage ? <><BookmarkCheck size={14} /> {STAGES.find(s => s.id === c.stage)?.label}</> : <><Bookmark size={14} /> Shortlist</>}</button>}
      </div>
    </article>
  );
}

export function TalentPage() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [min, setMin] = useState(Number(sp.get('min') ?? 0));
  const [prog, setProg] = useState(sp.get('programme') ?? '');
  const [cert, setCert] = useState(sp.get('cert') === '1');
  const [res, setRes] = useState<Cand[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cat = useApi<{ programmes: { id: number; name: string }[] }>('/catalog');

  const search = async () => {
    setBusy(true); setErr('');
    const params = new URLSearchParams({ q, min: String(min), programme: prog, cert: cert ? '1' : '' });
    setSp(params, { replace: true });
    try { setRes(await api<Cand[]>(`/talent?${params}`)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  useEffect(() => { search(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const shortlist = async (c: Cand) => {
    if (c.stage) return;
    await api(`/talent/${c.id}/shortlist`, { method: 'PUT', body: { stage: 'shortlisted' } });
    setRes(r => r?.map(x => x.id === c.id ? { ...x, stage: 'shortlisted' } : x) ?? null);
  };

  return (
    <div className="page">
      <PageHead eyebrow="Talent" title="Find graduates by what they can prove" sub="Every skill here is backed by a passed subject, a project or a certification. Only students who chose to be visible appear." />
      <form className="filters" onSubmit={e => { e.preventDefault(); search(); }}>
        <label className="filters__q"><Search size={18} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Skills, comma separated: SQL, Linux, Huawei Cloud" aria-label="Skills" /></label>
        <select value={prog} onChange={e => setProg(e.target.value)} aria-label="Programme"><option value="">All programmes</option>{cat.data?.programmes.map(p => <option key={p.id} value={p.id}>{p.name.replace(/^Bachelor of /, '').replace(/ with Honours$/, '')}</option>)}</select>
        <label className="filters__range"><span>Readiness ≥ {min}</span><input type="range" min={0} max={90} step={10} value={min} onChange={e => setMin(+e.target.value)} /></label>
        <label className="filters__check"><input type="checkbox" checked={cert} onChange={e => setCert(e.target.checked)} /> Has a certification</label>
        <button className="btn btn--primary" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
      </form>
      <Notice>{err}</Notice>
      {busy && !res && <Spinner label="Searching" />}
      {res && !res.length && <Empty icon={<Users />} title="No visible students match"><p>Try fewer skills or a lower readiness. Students appear here only after they switch on “Let recruiters find you”.</p></Empty>}
      {res && res.length > 0 && <>
        <p className="muted small">{res.length} student{res.length === 1 ? '' : 's'}</p>
        <div className="cands">{res.map(c => <CandidateCard key={c.id} c={c} onShortlist={shortlist} />)}</div>
      </>}
    </div>
  );
}

interface Detail extends Cand {
  email: string; phone: string | null; linkedin: string | null; github: string | null; website: string | null;
  plos: { code: string; domain: string; strength: number; evidence: string[] }[]; subjects: string[];
  skillsFull: { name: string; category: string; level: number; evidence: string | null }[];
  experiences: { kind: string; title: string; organisation: string | null; start_date: string | null; end_date: string | null; description: string | null }[];
  certificationsFull: { name: string; issuer: string | null; year: string | null; url: string | null }[];
  shortlist: { stage: string; note: string | null; role: string | null } | null;
}

export function CandidatePage() {
  const { id } = useParams();
  const d = useApi<Detail>(`/talent/${id}`);
  const [stage, setStage] = useState('');
  const [note, setNote] = useState('');
  const [role, setRole] = useState('');
  const [saved, setSaved] = useState('');
  useEffect(() => { if (d.data) { setStage(d.data.shortlist?.stage ?? ''); setNote(d.data.shortlist?.note ?? ''); setRole(d.data.shortlist?.role ?? ''); } }, [d.data]);
  if (d.loading && !d.data) return <div className="page"><Spinner label="Loading candidate" /></div>;
  if (d.error || !d.data) return <div className="page"><Notice>{d.error ?? 'Not found'}</Notice><Link to="/app/talent">Back to search</Link></div>;
  const c = d.data;
  const save = async (s = stage || 'shortlisted') => {
    await api(`/talent/${c.id}/shortlist`, { method: 'PUT', body: { stage: s, note, role } });
    setStage(s); setSaved('Saved'); setTimeout(() => setSaved(''), 1500);
  };
  const remove = async () => { await api(`/talent/${c.id}/shortlist`, { method: 'DELETE' }); setStage(''); };
  const link = (u: string) => (u.startsWith('http') ? u : `https://${u}`);

  return (
    <div className="page">
      <Link to="/app/talent" className="btn btn--text" style={{ justifySelf: 'start' }}><ArrowLeft size={14} /> Search</Link>
      <header className="cand-hero">
        <Avatar c={c} size={72} />
        <div>
          <h1>{c.name}</h1>
          <p className="muted">{c.headline || c.programme}</p>
          <div className="row small">
            <a href={`mailto:${c.email}`}><Mail size={14} /> {c.email}</a>
            {c.phone && <a href={`tel:${c.phone}`}><Phone size={14} /> {c.phone}</a>}
            {c.linkedin && <a href={link(c.linkedin)} target="_blank" rel="noreferrer"><Linkedin size={14} /> LinkedIn</a>}
            {c.github && <a href={link(c.github)} target="_blank" rel="noreferrer"><Github size={14} /> GitHub</a>}
            {c.website && <a href={link(c.website)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Portfolio</a>}
          </div>
        </div>
        <div className="cand-hero__kpis">
          <div><b>{c.readiness}</b><span>readiness</span></div>
          <div><b>{c.covered}/{c.total}</b><span>outcomes</span></div>
          <div><b>{c.best_interview ?? '–'}</b><span>best interview</span></div>
        </div>
      </header>

      <div className="grid-2 grid-2--wide-left">
        <div className="stack">
          <Card eyebrow="Programme learning outcomes" title="What their degree evidences">
            <ul className="plo-mini">{c.plos.map(p => <li key={p.code} title={p.evidence.join(', ')}><span className="mono">{p.code}</span><span className="plo-mini__d">{p.domain}</span><Meter value={p.strength} label={p.code} /></li>)}</ul>
          </Card>
          <Card eyebrow="Skills" title="With the evidence behind each">
            <ul className="evidence">{c.skillsFull.map(s => <li key={s.name}><div className="row between"><b>{s.name}</b><span className="dots" aria-label={`level ${s.level} of 5`}>{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= s.level ? 'on' : ''} />)}</span></div>{s.evidence && <span>{s.evidence}</span>}</li>)}</ul>
          </Card>
          {c.experiences.length > 0 && <Card eyebrow="Experience and projects" title="What they have built">
            <ul className="evidence">{c.experiences.map((x, i) => <li key={i}><div className="row between"><b>{x.title}{x.organisation ? ` · ${x.organisation}` : ''}</b><Tag>{x.kind}</Tag></div>{x.description && <span>{x.description}</span>}</li>)}</ul>
          </Card>}
        </div>
        <div className="stack">
          <Card eyebrow="Your pipeline" title={stage ? 'In your shortlist' : 'Not shortlisted'}>
            <div className="seg seg--wrap">{STAGES.map(s => <button key={s.id} type="button" className={stage === s.id ? 'is-on' : ''} onClick={() => save(s.id)}>{s.label}</button>)}</div>
            <input value={role} onChange={e => setRole(e.target.value)} placeholder="Considering for… e.g. Graduate Cloud Engineer" aria-label="Role" />
            <textarea rows={4} value={note} onChange={e => setNote(e.target.value)} placeholder="Private notes" aria-label="Notes" />
            <div className="row between"><span className="muted small">{saved}</span><div className="row">{stage && <button className="btn btn--ghost btn--sm" onClick={remove}>Remove</button>}<button className="btn btn--primary btn--sm" onClick={() => save()}>Save</button></div></div>
          </Card>
          <Card eyebrow="Education" title={c.programme ?? 'Education'}>
            <p className="small"><GraduationCap size={14} /> {c.institution}{c.grad_year ? ` · ${c.grad_year}` : ''}{c.cgpa ? ` · CGPA ${c.cgpa.toFixed(2)}` : ''}</p>
            <div className="chips">{c.subjects.map(s => <Tag key={s}>{s}</Tag>)}</div>
          </Card>
          {c.certificationsFull.length > 0 && <Card eyebrow="Certifications" title="Verified by the issuer">
            <ul className="list">{c.certificationsFull.map(x => <li key={x.name}><span><Award size={14} /> {x.name}</span><span className="muted small">{[x.issuer, x.year].filter(Boolean).join(' · ')}</span></li>)}</ul>
          </Card>}
        </div>
      </div>
    </div>
  );
}

export function ShortlistPage() {
  const list = useApi<Cand[]>('/talent/shortlist');
  const move = async (c: Cand, stage: string) => {
    list.setData(list.data!.map(x => x.id === c.id ? { ...x, stage } : x));
    await api(`/talent/${c.id}/shortlist`, { method: 'PUT', body: { stage } });
  };
  return (
    <div className="page">
      <PageHead eyebrow="Pipeline" title="Your shortlist" sub="Move candidates through your stages. Notes are private to you." actions={<Link className="btn btn--primary" to="/app/talent"><Search size={15} /> Find more</Link>} />
      {list.loading && !list.data ? <Spinner /> : !list.data?.length ? <Empty icon={<Bookmark />} title="No one shortlisted yet"><p>Search talent and shortlist the students you want to talk to.</p><Link className="btn btn--primary" to="/app/talent">Search talent</Link></Empty> : (
        <div className="board">
          {STAGES.map(s => {
            const col = list.data!.filter(c => c.stage === s.id);
            return (
              <section key={s.id} className={`board__col board__col--${s.id}`}>
                <h3>{s.label} <span className="muted">{col.length}</span></h3>
                {col.map(c => (
                  <div key={c.id} className="ticket">
                    <Link to={`/app/talent/${c.id}`} className="row" style={{ textDecoration: 'none' }}><Avatar c={c} size={32} /><span><b>{c.name}</b><br /><span className="muted small">{c.for_role || c.programme}</span></span></Link>
                    {c.note && <p className="small muted">{c.note}</p>}
                    <select value={c.stage ?? ''} onChange={e => move(c, e.target.value)} aria-label="Stage">{STAGES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
