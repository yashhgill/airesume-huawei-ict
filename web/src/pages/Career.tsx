import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Compass, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { Card, Empty, Meter, Notice, PageHead, Spinner, Tag } from '../components/ui';

interface Insights {
  roles: { title: string; match: number; why: string; matching: string[]; missing: string[]; salary_myr: string }[];
  certifications: { name: string; provider: string; why: string }[];
  learning_path: { step: string; resource: string }[];
}

export function CareerPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async () => { setBusy(true); setErr(''); try { setData(await api<Insights>('/ai/career', { body: {} })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };

  return (
    <div className="page">
      <PageHead eyebrow="Career paths" title="Where your profile can take you"
        sub="Entry-level roles in Malaysia that fit what you have evidenced, what you are missing, and how to close the gap."
        actions={<button className="btn btn--primary" onClick={run} disabled={busy}><Sparkles size={16} /> {data ? 'Refresh' : 'Analyse my profile'}</button>} />
      <Notice>{err}</Notice>
      {busy && <Spinner label="Comparing your skills with entry-level roles" />}
      {!data && !busy && <Empty icon={<Compass />} title="Run an analysis"><p>Uses your subjects, skills, experience and certifications. Takes about ten seconds.</p></Empty>}
      {data && (
        <>
          <div className="roles">
            {[...data.roles].sort((a, b) => b.match - a.match).map(r => (
              <article key={r.title} className="role">
                <div className="role__head"><h3>{r.title}</h3><b className="mono">{r.match}%</b></div>
                <Meter value={r.match} label={r.title} />
                <p>{r.why}</p>
                <p className="small"><span className="muted">Typical starting pay</span> <b>{r.salary_myr}</b></p>
                {r.matching.length > 0 && <div className="chips">{r.matching.map(m => <Tag key={m} tone="ok">{m}</Tag>)}</div>}
                {r.missing.length > 0 && <div className="chips">{r.missing.map(m => <Tag key={m} tone="warn">to learn: {m}</Tag>)}</div>}
                <div className="row">
                  <Link className="btn btn--ghost btn--sm" to={`/app/jobs?q=${encodeURIComponent(r.title)}`}>Find jobs</Link>
                  <Link className="btn btn--ghost btn--sm" to={`/app/resumes?new=1&role=${encodeURIComponent(r.title)}`}>Resume for this role</Link>
                </div>
              </article>
            ))}
          </div>
          <div className="grid-2">
            <Card eyebrow="Certifications" title="Worth getting next">
              <ul className="rows">{data.certifications.map(c => <li key={c.name}><Award size={18} /><div><b>{c.name}</b><span>{c.provider} · {c.why}</span></div></li>)}</ul>
            </Card>
            <Card eyebrow="Learning path" title="Four steps">
              <ol className="path">{data.learning_path.map(s => <li key={s.step}><b>{s.step}</b><span>{s.resource}</span></li>)}</ol>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
