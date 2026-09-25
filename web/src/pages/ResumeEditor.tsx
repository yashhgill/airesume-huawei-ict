import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, Mail, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { ResumeContent } from '../lib/types';
import { ResumeView } from '../components/ResumeView';
import { Field, Modal, Notice, Spinner } from '../components/ui';

interface Doc { id: string; title: string; template: string; target_role: string; content: ResumeContent; job_ref: { title: string; company: string; url?: string } | null }

export function ResumeEditor() {
  const { id } = useParams();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [letter, setLetter] = useState(false);

  useEffect(() => { api<Doc>(`/resumes/${id}`).then(setDoc).catch(e => setErr(e.message)); }, [id]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (err && !doc) return <div className="page"><Notice>{err}</Notice></div>;
  if (!doc) return <div className="page"><Spinner label="Opening resume" /></div>;
  const r = doc.content;
  const update = (patch: Partial<ResumeContent>) => { setDoc({ ...doc, content: { ...r, ...patch } }); setDirty(true); setMsg(''); };
  const save = async () => {
    try { await api(`/resumes/${doc.id}`, { method: 'PUT', body: { title: doc.title, template: doc.template, content: doc.content } }); setDirty(false); setMsg('Saved'); }
    catch (e) { setErr((e as Error).message); }
  };

  const entries = (k: 'experience' | 'projects', label: string) => (
    <fieldset className="ed__group">
      <legend>{label}</legend>
      {r[k].map((x, i) => (
        <div key={i} className="ed__entry">
          <div className="grid-2">
            <input aria-label="Title" value={x.title} onChange={e => update({ [k]: r[k].map((y, j) => j === i ? { ...y, title: e.target.value } : y) })} />
            <input aria-label="Period" value={x.period} onChange={e => update({ [k]: r[k].map((y, j) => j === i ? { ...y, period: e.target.value } : y) })} placeholder="2025 – Present" />
          </div>
          <input aria-label="Organisation" value={x.org} onChange={e => update({ [k]: r[k].map((y, j) => j === i ? { ...y, org: e.target.value } : y) })} placeholder="Organisation" />
          <textarea aria-label="Bullets, one per line" rows={Math.max(3, x.bullets.length + 1)} value={x.bullets.join('\n')} onChange={e => update({ [k]: r[k].map((y, j) => j === i ? { ...y, bullets: e.target.value.split('\n') } : y) })} />
          <button className="btn btn--text danger" onClick={() => update({ [k]: r[k].filter((_, j) => j !== i) })}><Trash2 size={14} /> Remove</button>
        </div>
      ))}
      <button className="btn btn--ghost btn--sm" onClick={() => update({ [k]: [...r[k], { title: 'New entry', org: '', period: '', bullets: [''] }] })}><Plus size={14} /> Add</button>
    </fieldset>
  );

  return (
    <div className="editor">
      <div className="editor__bar no-print">
        <Link to="/app/resumes" className="btn btn--ghost btn--sm"><ArrowLeft size={16} /> Resumes</Link>
        <input className="editor__title" value={doc.title} onChange={e => { setDoc({ ...doc, title: e.target.value }); setDirty(true); }} aria-label="Resume name" />
        <div className="seg seg--sm">{['modern', 'classic', 'compact'].map(t => <button key={t} className={doc.template === t ? 'is-on' : ''} onClick={() => { setDoc({ ...doc, template: t }); setDirty(true); }}>{t}</button>)}</div>
        <span className="muted small">{msg || (dirty ? 'Unsaved changes' : '')}</span>
        <button className="btn btn--ghost btn--sm" onClick={() => setLetter(true)}><Mail size={16} /> Cover letter</button>
        <Link className="btn btn--ghost btn--sm" to={`/app/ats?resume=${doc.id}`}><ClipboardCheck size={16} /> ATS check</Link>
        <button className="btn btn--ghost btn--sm" onClick={() => window.print()}><Printer size={16} /> PDF</button>
        <button className="btn btn--primary btn--sm" onClick={save} disabled={!dirty}><Save size={16} /> Save</button>
      </div>
      <Notice>{err}</Notice>
      <div className="editor__body">
        <aside className="ed no-print">
          <Field label="Headline"><input value={r.headline} onChange={e => update({ headline: e.target.value })} /></Field>
          <Field label="Profile summary"><textarea rows={5} value={r.summary} onChange={e => update({ summary: e.target.value })} /></Field>
          <fieldset className="ed__group">
            <legend>Skills</legend>
            {r.skills.map((g, i) => (
              <div key={i} className="ed__skill">
                <input aria-label="Group" value={g.group} onChange={e => update({ skills: r.skills.map((y, j) => j === i ? { ...y, group: e.target.value } : y) })} />
                <input aria-label="Items, comma separated" value={g.items.join(', ')} onChange={e => update({ skills: r.skills.map((y, j) => j === i ? { ...y, items: e.target.value.split(',').map(s => s.trim()) } : y) })} />
              </div>
            ))}
            <button className="btn btn--ghost btn--sm" onClick={() => update({ skills: [...r.skills, { group: 'Other', items: [] }] })}><Plus size={14} /> Add group</button>
          </fieldset>
          {entries('experience', 'Experience')}
          {entries('projects', 'Projects')}
          <p className="muted small">Education, certifications and contact details come from your profile.</p>
        </aside>
        <div className="paper-wrap"><ResumeView r={r} template={doc.template} /></div>
      </div>
      {letter && <CoverLetter onClose={() => setLetter(false)} defaultJob={doc.job_ref ? `${doc.job_ref.title} at ${doc.job_ref.company}` : doc.target_role} />}
    </div>
  );
}

function CoverLetter({ onClose, defaultJob }: { onClose: () => void; defaultJob: string }) {
  const [title, setTitle] = useState(defaultJob);
  const [company, setCompany] = useState('');
  const [jd, setJd] = useState('');
  const [out, setOut] = useState<{ subject: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { setOut(await api('/ai/cover-letter', { body: { job: { title, company, description: jd } } })); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Cover letter" onClose={onClose} wide>
      {!out ? (
        <form className="stack" onSubmit={go}>
          <div className="grid-2"><Field label="Role"><input value={title} onChange={e => setTitle(e.target.value)} required /></Field><Field label="Company"><input value={company} onChange={e => setCompany(e.target.value)} /></Field></div>
          <Field label="Job description"><textarea rows={7} value={jd} onChange={e => setJd(e.target.value)} required /></Field>
          <Notice>{err}</Notice>
          <button className="btn btn--primary" disabled={busy}>{busy ? 'Writing…' : 'Write cover letter'}</button>
        </form>
      ) : (
        <div className="stack">
          <Field label="Email subject"><input value={out.subject} onChange={e => setOut({ ...out, subject: e.target.value })} /></Field>
          <textarea className="letter" rows={16} value={out.body} onChange={e => setOut({ ...out, body: e.target.value })} />
          <div className="row"><button className="btn btn--primary" onClick={async () => { try { await navigator.clipboard.writeText(`${out.subject}\n\n${out.body}`); setCopied(true); } catch { setCopied(false); } }}>{copied ? 'Copied' : 'Copy to clipboard'}</button><button className="btn btn--ghost" onClick={() => setOut(null)}>Start over</button></div>
        </div>
      )}
    </Modal>
  );
}
