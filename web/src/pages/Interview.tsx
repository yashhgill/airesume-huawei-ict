import { useCallback, useState } from 'react';
import { ArrowLeft, ArrowRight, Lightbulb, Mic, MicOff, Play, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useDictation } from '../lib/speech';
import { Card, Empty, Field, Notice, PageHead, Score, Spinner, Tag } from '../components/ui';

interface Q { q: string; focus: string; tip: string }
interface A { answer: string; score: number; verdict: string; strengths: string[]; improve: string[]; better: string }
interface Iv { id: string; role: string; kind: string; questions: Q[]; answers: (A | null)[]; score: number | null; created_at: string }

export function InterviewPage() {
  const list = useApi<Iv[]>('/interviews');
  const [iv, setIv] = useState<Iv | null>(null);
  const [role, setRole] = useState('');
  const [kind, setKind] = useState('mixed');
  const [job, setJob] = useState('');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const start = async () => {
    setBusy('start'); setErr('');
    try { setIv(await api<Iv>('/interviews', { body: { role, kind, job } })); list.reload(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };

  if (iv) return <Session iv={iv} setIv={setIv} onExit={() => { setIv(null); list.reload(); }} />;

  return (
    <div className="page">
      <PageHead eyebrow="Practice" title="Mock interview" sub="Five questions a Malaysian hiring panel would ask, built from your own record. Answer by typing or speaking, and get scored feedback on every answer." />
      <div className="grid-2 grid-2--wide-left">
        <Card title="Start a session">
          <Field label="Role you are interviewing for"><input value={role} onChange={e => setRole(e.target.value)} placeholder="e.g. Cloud Support Engineer" /></Field>
          <div className="field"><span className="field__label">Style</span>
            <div className="seg">{['behavioural', 'technical', 'mixed'].map(k => <button key={k} type="button" className={kind === k ? 'is-on' : ''} onClick={() => setKind(k)}>{k}</button>)}</div>
          </div>
          <Field label="Job advert (optional)" hint="Paste it and the questions will follow what this employer is looking for."><textarea rows={4} value={job} onChange={e => setJob(e.target.value)} /></Field>
          <Notice>{err}</Notice>
          <button className="btn btn--primary btn--lg" disabled={!role.trim() || !!busy} onClick={start}>{busy ? <Spinner label="Preparing your questions" /> : <><Play size={16} /> Start interview</>}</button>
        </Card>
        <Card eyebrow="History" title="Past sessions">
          {list.loading ? <Spinner /> : !list.data?.length ? <Empty icon={<Mic />} title="No sessions yet"><p>Your scores will show here so you can see yourself improve.</p></Empty> : (
            <ul className="iv__hist">
              {list.data.map(x => (
                <li key={x.id}>
                  <button className="linkish" onClick={() => setIv(x)}><b>{x.role}</b></button>
                  {x.score != null ? <Tag tone={x.score >= 70 ? 'ok' : x.score >= 50 ? 'warn' : 'bad'}>{x.score}</Tag> : <Tag>{x.answers.filter(Boolean).length}/{x.questions.length}</Tag>}
                  <span className="mono">{x.kind} · {x.created_at.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Session({ iv, setIv, onExit }: { iv: Iv; setIv: (v: Iv) => void; onExit: () => void }) {
  const firstOpen = iv.questions.findIndex((_, i) => !iv.answers[i]);
  const [idx, setIdx] = useState(firstOpen < 0 ? 0 : firstOpen);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const dict = useDictation(useCallback((t: string) => setDraft(d => (d ? `${d} ${t}` : t)), []));
  const q = iv.questions[idx], a = iv.answers[idx];
  const done = iv.score != null;

  const submit = async () => {
    dict.stop(); setBusy(true); setErr('');
    try {
      const r = await api<{ feedback: A; score: number | null }>(`/interviews/${iv.id}/answer`, { body: { index: idx, answer: draft } });
      const answers = [...iv.answers]; answers[idx] = r.feedback;
      setIv({ ...iv, answers, score: r.score }); setDraft('');
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => { if (!confirm('Delete this session?')) return; await api(`/interviews/${iv.id}`, { method: 'DELETE' }); onExit(); };

  return (
    <div className="page">
      <PageHead eyebrow={`Mock interview · ${iv.kind}`} title={iv.role}
        actions={<><button className="btn btn--ghost btn--sm" onClick={onExit}><ArrowLeft size={14} /> All sessions</button><button className="icon-btn" onClick={remove} aria-label="Delete session"><Trash2 size={16} /></button></>} />
      <div className="iv__progress" aria-label="Questions">
        {iv.questions.map((_, i) => <button key={i} aria-label={`Question ${i + 1}`} className={`${iv.answers[i] ? 'answered' : ''} ${i === idx ? 'cur' : ''}`} onClick={() => { setIdx(i); setDraft(''); }} />)}
      </div>
      <div className="iv">
        <Card>
          <div className="row between"><span className="mono muted">Question {idx + 1} of {iv.questions.length}</span><Tag>{q.focus}</Tag></div>
          <p className="iv__q">{q.q}</p>
          {!a ? (
            <>
              <p className="iv__tip"><Lightbulb size={16} /> {q.tip}</p>
              <textarea rows={7} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Answer as you would in the room. Aim for 60 to 150 words." aria-label="Your answer" />
              <Notice>{err}</Notice>
              <div className="row between">
                {dict.supported ? <button className={`btn btn--ghost mic ${dict.on ? 'rec' : ''}`} onClick={dict.on ? dict.stop : dict.start}>{dict.on ? <><MicOff size={16} /> Stop</> : <><Mic size={16} /> Speak</>}</button> : <span className="muted small">{draft.split(/\s+/).filter(Boolean).length} words</span>}
                <button className="btn btn--primary" disabled={busy || draft.trim().length < 15} onClick={submit}>{busy ? <Spinner label="Scoring" /> : <>Submit answer <ArrowRight size={16} /></>}</button>
              </div>
            </>
          ) : (
            <div className="iv__fb">
              <div className="iv__mark"><b>{a.score}<small>/10</small></b><p>{a.verdict}</p></div>
              <div className="grid-2">
                <div className="stack-sm"><p className="eyebrow">What worked</p><ul className="bullets">{a.strengths.map(s => <li key={s}>{s}</li>)}</ul></div>
                <div className="stack-sm"><p className="eyebrow">Make it stronger</p><ul className="bullets">{a.improve.map(s => <li key={s}>{s}</li>)}</ul></div>
              </div>
              <details><summary className="small"><b>Your answer</b></summary><p className="small muted mt">{a.answer}</p></details>
              <div className="stack-sm"><p className="eyebrow">A stronger version, using your facts</p><p className="iv__better">{a.better}</p></div>
              <div className="row end">
                <button className="btn btn--ghost btn--sm" onClick={() => { const answers = [...iv.answers]; answers[idx] = null; setIv({ ...iv, answers, score: null }); setDraft(a.answer); }}><RotateCcw size={14} /> Try again</button>
                {idx < iv.questions.length - 1 && <button className="btn btn--primary btn--sm" onClick={() => { setIdx(idx + 1); setDraft(''); }}>Next question <ArrowRight size={14} /></button>}
              </div>
            </div>
          )}
        </Card>
        <Card eyebrow="Session" title={done ? 'Final score' : 'Progress'}>
          <div className="center" style={{ justifySelf: 'center' }}><Score value={iv.score ?? Math.round((iv.answers.filter(Boolean).reduce((s, x) => s + (x?.score ?? 0), 0) / Math.max(1, iv.answers.filter(Boolean).length)) * 10)} size={140} label={done ? 'overall' : 'so far'} /></div>
          <ul className="iv__hist">
            {iv.questions.map((x, i) => <li key={i}><button className="linkish small" onClick={() => setIdx(i)}>{i + 1}. {x.focus}</button>{iv.answers[i] ? <Tag tone={iv.answers[i]!.score >= 7 ? 'ok' : iv.answers[i]!.score >= 5 ? 'warn' : 'bad'}>{iv.answers[i]!.score}/10</Tag> : <span className="muted small">–</span>}</li>)}
          </ul>
          {done && <p className="small muted">Ask your coach to turn your weakest answer into a story you can reuse.</p>}
        </Card>
      </div>
    </div>
  );
}
