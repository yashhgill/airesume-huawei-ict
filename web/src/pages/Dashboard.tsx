import { Link } from 'react-router-dom';
import { ArrowRight, BriefcaseBusiness, ClipboardCheck, FileText, GraduationCap, Sparkles } from 'lucide-react';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import type { Competency, Profile } from '../lib/types';
import { Card, Meter, PageHead, Score, Spinner, Tag } from '../components/ui';

export function Dashboard() {
  const { user } = useAuth();
  const prof = useApi<Profile>('/me');
  const comp = useApi<Competency>('/profile/competency');
  const resumes = useApi<{ id: string; title: string; ats_score: number | null; updated_at: string }[]>('/resumes');
  const saved = useApi<{ id: string; status: string }[]>('/jobs/saved');

  if (prof.loading || comp.loading) return <div className="page"><Spinner label="Loading your dashboard" /></div>;
  const p = prof.data, c = comp.data;
  const fresh = p && !p.education.length && !p.skills.length;

  return (
    <div className="page">
      <PageHead eyebrow="Dashboard" title={`Hi ${user?.name.split(' ')[0]}`} sub="Here is how ready your profile is for the jobs you want." />

      {fresh && (
        <div className="callout">
          <GraduationCap size={28} />
          <div><h3>Start with your programme</h3><p>Pick your programme and tick the subjects you have completed. We turn them into skills and evidence in about two minutes.</p></div>
          <Link className="btn btn--primary" to="/app/start">Map my subjects <ArrowRight size={16} /></Link>
        </div>
      )}

      <div className="dash-top">
        <Card className="readiness">
          <Score value={c?.readiness ?? 0} size={132} label="ready" />
          <div className="stack-sm">
            <p className="eyebrow">Employability readiness</p>
            <h2>{(c?.readiness ?? 0) >= 75 ? 'Strong, keep it current' : (c?.readiness ?? 0) >= 45 ? 'Getting there' : 'Just getting started'}</h2>
            <ul className="next">{c?.next.slice(0, 3).map(n => <li key={n}>{n}</li>)}</ul>
          </div>
        </Card>
        <div className="kpis">
          <Kpi label="Skills" value={p?.skills.length ?? 0} to="/app/profile?tab=skills" />
          <Kpi label="PLOs evidenced" value={c?.total ? `${c.covered}/${c.total}` : '–'} to="/app/competency" />
          <Kpi label="Resumes" value={resumes.data?.length ?? 0} to="/app/resumes" />
          <Kpi label="Applications" value={saved.data?.filter(s => s.status !== 'saved').length ?? 0} to="/app/tracker" />
        </div>
      </div>

      <div className="grid-2">
        <Card eyebrow="Programme learning outcomes" title="Competency coverage" actions={<Link className="btn btn--text" to="/app/competency">Open map</Link>}>
          {!c?.total ? <p className="muted">Add your programme to see coverage.</p> : (
            <ul className="plo-mini">
              {c.plos.map(pl => (
                <li key={pl.code}>
                  <span className="mono">{pl.code}</span>
                  <span className="plo-mini__d">{pl.domain}</span>
                  <Meter value={pl.strength} label={pl.code} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="stack">
          <Card eyebrow="Next steps" title="What to do now">
            <div className="actions">
              <Link to="/app/resumes?new=1" className="action"><FileText size={20} /><b>Generate a resume</b><span>From your profile, for a target role</span></Link>
              <Link to="/app/jobs" className="action"><BriefcaseBusiness size={20} /><b>Find matching jobs</b><span>Ranked by your skills</span></Link>
              <Link to="/app/ats" className="action"><ClipboardCheck size={20} /><b>Check against a job ad</b><span>Keywords, score, rewrites</span></Link>
              <Link to="/app/career" className="action"><Sparkles size={20} /><b>Explore career paths</b><span>Roles, salaries, certifications</span></Link>
            </div>
          </Card>
          <Card eyebrow="Recent" title="Resumes">
            {!resumes.data?.length ? <p className="muted">No resumes yet.</p> : (
              <ul className="list">
                {resumes.data.slice(0, 4).map(r => (
                  <li key={r.id}><Link to={`/app/resumes/${r.id}`}>{r.title}</Link>{r.ats_score != null ? <Tag tone={r.ats_score >= 70 ? 'ok' : 'warn'}>ATS {r.ats_score}</Tag> : <span className="muted small">{r.updated_at.slice(0, 10)}</span>}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, to }: { label: string; value: number | string; to: string }) {
  return <Link to={to} className="kpi"><span>{label}</span><b>{value}</b></Link>;
}
