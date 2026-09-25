import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Card, Empty, Field, Notice, PageHead, Score, Spinner, Tag } from '../components/ui';

interface Result { score: number; keywordScore: number; aiScore: number; matched: string[]; missing: string[]; verdict: string; strengths: string[]; gaps: string[]; rewrites: { before: string; after: string }[] }

export function AtsPage() {
  const [sp] = useSearchParams();
  const list = useApi<{ id: string; title: string }[]>('/resumes');
  const [resumeId, setResumeId] = useState(sp.get('resume') ?? '');
  const [jd, setJd] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (!resumeId && list.data?.length) setResumeId(list.data[0].id); }, [list.data, resumeId]);

  const run = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { setRes(await api<Result>('/ai/ats', { body: { resume_id: resumeId, job_description: jd } })); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  if (list.loading) return <div className="page"><Spinner /></div>;
  if (!list.data?.length) return <div className="page"><PageHead eyebrow="ATS check" title="Test a resume against a job ad" /><Empty icon={<ClipboardCheck />} title="Generate a resume first"><Link className="btn btn--primary" to="/app/resumes?new=1">New resume</Link></Empty></div>;

  return (
    <div className="page">
      <PageHead eyebrow="ATS check" title="Test a resume against a job ad" sub="Most companies filter resumes with an applicant tracking system before a person reads them. See what it sees." />
      <div className="grid-2">
        <Card>
          <form className="stack" onSubmit={run}>
            <Field label="Resume"><select value={resumeId} onChange={e => setResumeId(e.target.value)}>{list.data.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></Field>
            <Field label="Job description" hint="Paste the whole ad: responsibilities and requirements."><textarea rows={14} value={jd} onChange={e => setJd(e.target.value)} required /></Field>
            <Notice>{err}</Notice>
            <button className="btn btn--primary" disabled={busy || jd.trim().length < 80}>{busy ? 'Scanning…' : 'Check my resume'}</button>
          </form>
        </Card>
        <div className="stack">
          {busy && <Card><Spinner label="Scanning keywords and reading like a recruiter" /></Card>}
          {!res && !busy && <Card><p className="muted">Results appear here: an overall score, the keywords you hit and miss, and suggested rewrites that only use facts already in your resume.</p></Card>}
          {res && (
            <>
              <Card className="ats-top">
                <Score value={res.score} size={120} label="fit" />
                <div className="stack-sm">
                  <h2>{res.verdict}</h2>
                  <p className="muted small">Keyword match {res.keywordScore}% · recruiter read {res.aiScore}%</p>
                  <Link className="btn btn--ghost btn--sm" to={`/app/resumes/${resumeId}`}>Edit this resume</Link>
                </div>
              </Card>
              <Card title="Keywords">
                <div className="chips">{res.matched.map(k => <Tag key={k} tone="ok">✓ {k}</Tag>)}{res.missing.map(k => <Tag key={k} tone="bad">✕ {k}</Tag>)}</div>
                {res.missing.length > 0 && <p className="muted small">Only add a missing keyword if you genuinely have the skill. Otherwise it is a learning goal.</p>}
              </Card>
              <div className="grid-2">
                <Card title="Strengths"><ul className="bullets">{res.strengths.map(s => <li key={s}>{s}</li>)}</ul></Card>
                <Card title="Gaps"><ul className="bullets">{res.gaps.map(s => <li key={s}>{s}</li>)}</ul></Card>
              </div>
              {res.rewrites.length > 0 && (
                <Card title="Suggested rewrites">
                  <ul className="rewrites">{res.rewrites.map((w, i) => <li key={i}><p className="before">{w.before}</p><p className="after">{w.after}</p></li>)}</ul>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
