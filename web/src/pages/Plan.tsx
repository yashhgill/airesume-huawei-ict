import { useState } from 'react';
import { Award, Check, RefreshCw, Route } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Card, Field, Notice, PageHead, Score, Spinner, Tag } from '../components/ui';

interface Task { title: string; kind: string; resource: string; minutes: number; done?: boolean }
interface Plan { id: string; role: string; created_at: string; content: { summary: string; role: string; certification?: { name: string; why: string }; weeks: { week: number; theme: string; tasks: Task[] }[] } }

export function PlanPage() {
  const plan = useApi<Plan | null>('/plan');
  const [editing, setEditing] = useState(false);

  if (plan.loading && !plan.data) return <div className="page"><Spinner label="Loading your plan" /></div>;
  const p = plan.data;
  if (!p || editing) return <Builder onDone={async () => { await plan.reload(); setEditing(false); }} onCancel={p ? () => setEditing(false) : undefined} />;

  const all = p.content.weeks.flatMap(w => w.tasks);
  const pct = all.length ? Math.round((all.filter(t => t.done).length / all.length) * 100) : 0;
  const nowWeek = p.content.weeks.findIndex(w => w.tasks.some(t => !t.done));

  const toggle = async (wi: number, ti: number, done: boolean) => {
    const next = structuredClone(p); next.content.weeks[wi].tasks[ti].done = done; plan.setData(next);
    await api('/plan/task', { method: 'PUT', body: { week: wi, index: ti, done } }).catch(() => plan.reload());
  };

  return (
    <div className="page">
      <PageHead eyebrow="Learning plan" title={`Becoming a ${p.role}`} sub={p.content.summary}
        actions={<button className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}><RefreshCw size={14} /> New plan</button>} />
      <Card className="plan-top">
        <Score value={pct} size={120} label="done" />
        <div className="stack-sm">
          <p><b>{all.filter(t => t.done).length} of {all.length} tasks</b> across {p.content.weeks.length} weeks. {nowWeek >= 0 ? `You are in week ${nowWeek + 1}.` : 'Every task is done. Time to apply.'}</p>
          {p.content.certification && <p className="row"><Award size={16} /> <b>{p.content.certification.name}</b><span className="muted small">{p.content.certification.why}</span></p>}
        </div>
      </Card>
      <div className="weeks">
        {p.content.weeks.map((w, wi) => {
          const done = w.tasks.every(t => t.done);
          return (
            <section key={wi} className={`week ${done ? 'is-done' : ''} ${wi === nowWeek ? 'is-now' : ''}`}>
              <div className="week__n"><span>Week</span><b>{w.week}</b></div>
              <div>
                <div className="row between"><h3>{w.theme}</h3>{wi === nowWeek && <Tag tone="accent">This week</Tag>}{done && <Tag tone="ok">Done</Tag>}</div>
                {w.tasks.map((t, ti) => (
                  <div key={ti} className={`task ${t.done ? 'done' : ''}`}>
                    <button className="task__box" aria-label={t.done ? 'Mark not done' : 'Mark done'} onClick={() => toggle(wi, ti, !t.done)}><Check size={14} strokeWidth={3.5} /></button>
                    <span><span className="task__t">{t.title}</span><span className="task__r">{t.resource} · {t.minutes} min</span></span>
                    <span className="task__k">{t.kind}</span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Builder({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [role, setRole] = useState('');
  const [weeks, setWeeks] = useState(6);
  const [hours, setHours] = useState(6);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { await api('/plan', { body: { role, weeks, hours } }); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="page">
      <PageHead eyebrow="Learning plan" title="Plan your route to a role" sub="PathForward reads your competency gaps and builds a week-by-week plan with free resources, a portfolio project and the right certification." />
      <Card>
        <Field label="Role you are working towards"><input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Cloud Engineer, Data Analyst, Software Developer" /></Field>
        <div className="chips">{['Cloud Engineer', 'Data Analyst', 'Software Developer', 'Network Engineer', 'Cybersecurity Analyst'].map(r => <button key={r} className={`chip ${role === r ? 'chip--on' : ''}`} onClick={() => setRole(r)}>{r}</button>)}</div>
        <div className="grid-2">
          <Field label={`Length: ${weeks} weeks`}><input type="range" min={2} max={12} value={weeks} onChange={e => setWeeks(+e.target.value)} /></Field>
          <Field label={`Time: ${hours} hours a week`}><input type="range" min={2} max={20} value={hours} onChange={e => setHours(+e.target.value)} /></Field>
        </div>
        <Notice>{err}</Notice>
        <div className="row">
          <button className="btn btn--primary btn--lg" disabled={!role.trim() || busy} onClick={go}>{busy ? <Spinner label="Designing your plan" /> : <><Route size={16} /> Build my plan</>}</button>
          {onCancel && <button className="btn btn--ghost" onClick={onCancel}>Cancel</button>}
        </div>
      </Card>
    </div>
  );
}
