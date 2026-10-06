import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BriefcaseBusiness, Check, FileText, GraduationCap, MessageCircle, Mic, Send } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Card, Notice, Spinner } from '../components/ui';

interface Task { title: string; kind: string; resource: string; minutes: number; done?: boolean; i: number }
interface TodayData {
  name: string; streak: number; week: { day: string; active: boolean }[]; readiness: number; covered: number; total: number;
  moves: { title: string; why: string; to: string; kind: string }[];
  plan: null | { role: string; progress: number; weeks: number; current: null | { index: number; week: number; theme: string; tasks: Task[] } };
  interview: null | { id: string; role: string; score: number | null };
  resumes: number; applied: number; saved: number; views: number; sharing: boolean;
  journey: { key: string; label: string; done: boolean }[];
}

const JOURNEY_LINK: Record<string, string> = { map: '/app/start', skills: '/app/profile?tab=skills', resume: '/app/resumes', practice: '/app/interview', apply: '/app/jobs' };
const JOURNEY_ICON: Record<string, typeof Check> = { map: GraduationCap, skills: Check, resume: FileText, practice: Mic, apply: BriefcaseBusiness };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Today() {
  const t = useApi<TodayData>('/today');
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  if (t.loading && !t.data) return <div className="page"><Spinner label="Getting your day ready" /></div>;
  if (t.error || !t.data) return <div className="page"><Notice>{t.error ?? 'Could not load today.'}</Notice></div>;
  const d = t.data;
  const doneSteps = d.journey.filter(j => j.done).length;
  const nowIdx = d.journey.findIndex(j => !j.done);
  const pct = Math.max(0, (Math.max(doneSteps, 1) - 1) / (d.journey.length - 1)) * 100;

  const toggle = async (task: Task) => {
    if (!d.plan?.current) return;
    setBusy(task.title);
    await api('/plan/task', { method: 'PUT', body: { week: d.plan.current.index, index: task.i, done: !task.done } }).catch(() => {});
    await t.reload(); setBusy(null);
  };
  const ask = (text: string) => nav(`/app/coach?q=${encodeURIComponent(text)}`);

  return (
    <div className="page">
      <header className="today-head">
        <div>
          <p className="eyebrow">{new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>{greeting()}, <em>{d.name}</em>.</h1>
        </div>
        <div className="streak" title="Days you used PathForward in the last two weeks">
          <span className="streak__n">{d.streak}<small>day{d.streak === 1 ? '' : 's'} streak</small></span>
          <span className="streak__days" aria-hidden>{d.week.map((w, i) => <i key={w.day} className={`${w.active ? 'on' : ''} ${i === d.week.length - 1 ? 'today' : ''}`} />)}</span>
        </div>
      </header>

      <nav className="journey" aria-label="Your path">
        <div className="journey__track"><div className="journey__fill" style={{ width: `${pct}%` }} /></div>
        {d.journey.map((j, i) => {
          const Icon = JOURNEY_ICON[j.key] ?? Check;
          return (
            <Link key={j.key} to={JOURNEY_LINK[j.key]} className={`journey__step js-${j.key} ${j.done ? 'done' : ''} ${i === nowIdx ? 'now' : ''}`}>
              <span className="journey__dot">{j.done ? <Check size={18} strokeWidth={3} /> : <Icon size={17} />}</span>{j.label}
            </Link>
          );
        })}
      </nav>

      <div className="today-grid">
        <Card eyebrow="Your next moves" title={d.moves.length ? 'Three things worth doing today' : 'You are on track'}>
          {d.moves.length ? (
            <div className="moves">
              {d.moves.map((m, i) => (
                <Link key={m.kind} to={m.to} className={`move mv-${i}`}>
                  <span className="move__n">{String(i + 1).padStart(2, '0')}</span>
                  <span><b>{m.title}</b><span>{m.why}</span></span>
                  <ArrowRight size={18} />
                </Link>
              ))}
            </div>
          ) : <p className="muted">Everything core is done. Keep your streak going with a practice interview or a chat with your coach.</p>}
        </Card>

        <Card eyebrow={d.plan ? `Learning plan · ${d.plan.role}` : 'Learning plan'} title={d.plan?.current ? `Week ${d.plan.current.week}: ${d.plan.current.theme}` : d.plan ? 'Plan complete' : 'No plan yet'}
          actions={d.plan && <Link className="btn btn--text" to="/app/plan">{d.plan.progress}% done</Link>}>
          {!d.plan && <><p className="muted">Tell PathForward the role you want. It builds a week-by-week plan from the gaps in your record.</p><Link className="btn btn--primary" to="/app/plan">Build my plan <ArrowRight size={16} /></Link></>}
          {d.plan?.current && (
            <div className="plan-mini">
              {d.plan.current.tasks.map(task => (
                <div key={task.i} className={`task ${task.done ? 'done' : ''}`}>
                  <button className="task__box" aria-label={task.done ? 'Mark not done' : 'Mark done'} disabled={busy === task.title} onClick={() => toggle(task)}><Check size={14} strokeWidth={3.5} /></button>
                  <span><span className="task__t">{task.title}</span><span className="task__r">{task.resource} · {task.minutes} min</span></span>
                  <span className={`task__k k-${task.kind}`}>{task.kind}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="stack-sm">
        <form className="ask" onSubmit={e => { e.preventDefault(); if (q.trim()) ask(q.trim()); }}>
          <MessageCircle size={18} className="muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Ask your coach anything: which job should I apply for first?" aria-label="Ask your coach" />
          <button className="btn btn--primary btn--sm" disabled={!q.trim()}><Send size={15} /> Ask</button>
        </form>
        <div className="ask__chips">
          {['What should I focus on this week?', 'Am I ready for a cloud role?', 'Review my weakest learning outcome'].map(s => <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>)}
        </div>
      </div>

      <div className="stat-row">
        <Link to="/app/competency" className="stat stat--c1"><span>Readiness</span><b>{d.readiness}<small className="muted" style={{ fontSize: 15 }}>/100</small></b></Link>
        <Link to="/app/competency" className="stat stat--c2"><span>Outcomes evidenced</span><b>{d.total ? `${d.covered}/${d.total}` : '–'}</b></Link>
        <Link to="/app/interview" className="stat stat--c3"><span>Last interview</span><b>{d.interview?.score ?? '–'}</b></Link>
        {d.sharing
          ? <Link to="/app/profile?tab=about" className="stat stat--c5"><span>Recruiter views · 30 days</span><b>{d.views}</b></Link>
          : <Link to="/app/profile?tab=about" className="stat stat--c5"><span>Recruiters</span><b className="stat__cta">Get found →</b></Link>}
      </div>
    </div>
  );
}
