import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowUp, ClipboardCheck, Eye, EyeOff, Mail, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import type { ResumeContent } from '../lib/types';
import { ResumeView } from '../components/ResumeView';
import { Field, Modal, Notice, Spinner } from '../components/ui';

interface Doc { id: string; title: string; template: string; target_role: string; content: ResumeContent; job_ref: { title: string; company: string; url?: string } | null }

export function ResumeEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<'edit' | 'preview'>('edit');
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

  const hidden = new Set(r.hidden ?? []);
  const toggle = (k: string) => { const h = new Set(hidden); h.has(k) ? h.delete(k) : h.add(k); update({ hidden: [...h] }); };
  // List helpers: edit, remove and reorder any array section
  function move<T>(list: T[], i: number, d: number) { const n = [...list]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; }
  const entries = (k: 'experience' | 'projects', label: string) => (
    <Group hidden={hidden} toggle={toggle} k={k} label={label} onAdd={() => update({ [k]: [...r[k], { title: '', org: '', period: '', bullets: [''] }] })}>
      {r[k].map((x, i) => (
        <div key={i} className="ed__entry">
          <div className="grid-2">
            <input aria-label="Title" placeholder="Role or project name" value={x.title} onChange={e => update({ [k]: r[k].map((y, j) => j === i ? { ...y, title: e.target.value } : y) })} />
            <input aria-label="Period" value={x.period} onChange={e => update({ [k]: r[k].map((y, j) => j === i ? { ...y, period: e.target.value } : y) })} placeholder="Feb 2025 – Present" />
          </div>
          <input aria-label="Organisation" value={x.org} onChange={e => update({ [k]: r[k].map((y, j) => j === i ? { ...y, org: e.target.value } : y) })} placeholder={k === 'projects' ? 'Context, e.g. Hari Inovasi Kebangsaan 2026 · 2nd place' : 'Company'} />
          <textarea aria-label="Bullets, one per line" placeholder="One achievement per line. Start with a verb, add a real number if you have one." rows={Math.max(3, x.bullets.length + 1)} value={x.bullets.join('\n')} onChange={e => update({ [k]: r[k].map((y, j) => j === i ? { ...y, bullets: e.target.value.split('\n') } : y) })} />
          <Tools onUp={() => update({ [k]: move(r[k], i, -1) })} onDown={() => update({ [k]: move(r[k], i, 1) })} onRemove={() => update({ [k]: r[k].filter((_, j) => j !== i) })} />
        </div>
      ))}
    </Group>
  );

  const c = r.contact;
  const setC = (patch: Partial<ResumeContent['contact']>) => update({ contact: { ...c, ...patch } });
  const lines = (k: 'awards' | 'languages', label: string, ph: string) => (
    <Group hidden={hidden} toggle={toggle} k={k} label={label}>
      <textarea rows={Math.max(2, (r[k]?.length ?? 0) + 1)} placeholder={ph} value={(r[k] ?? []).join('\n')} onChange={e => update({ [k]: e.target.value.split('\n') })} />
      <p className="muted small">One per line.</p>
    </Group>
  );

  const editor = (
    <aside className="ed no-print">
      <fieldset className="ed__group">
        <legend>Header</legend>
        <Field label="Full name"><input value={r.name} onChange={e => update({ name: e.target.value })} /></Field>
        <Field label="Headline"><input value={r.headline} onChange={e => update({ headline: e.target.value })} placeholder="Cloud & DevOps Intern · AWS · Kubernetes" /></Field>
        <div className="grid-2">
          <input aria-label="Email" placeholder="Email" value={c.email ?? ''} onChange={e => setC({ email: e.target.value })} />
          <input aria-label="Phone" placeholder="Phone" value={c.phone ?? ''} onChange={e => setC({ phone: e.target.value })} />
          <input aria-label="Location" placeholder="Location" value={c.location ?? ''} onChange={e => setC({ location: e.target.value })} />
          <input aria-label="LinkedIn" placeholder="linkedin.com/in/…" value={c.linkedin ?? ''} onChange={e => setC({ linkedin: e.target.value })} />
          <input aria-label="GitHub" placeholder="github.com/…" value={c.github ?? ''} onChange={e => setC({ github: e.target.value })} />
          <input aria-label="Website" placeholder="Portfolio / website" value={c.website ?? ''} onChange={e => setC({ website: e.target.value })} />
        </div>
      </fieldset>
      <Group hidden={hidden} toggle={toggle} k="summary" label="Profile summary">
        <textarea rows={5} value={r.summary} onChange={e => update({ summary: e.target.value })} />
        <p className="muted small">{r.summary.trim().split(/\s+/).filter(Boolean).length} words · aim for 40–70.</p>
      </Group>
      <Group hidden={hidden} toggle={toggle} k="skills" label="Skills" onAdd={() => update({ skills: [...r.skills, { group: '', items: [] }] })} addLabel="Add group">
        {r.skills.map((g, i) => (
          <div key={i} className="ed__skill">
            <input aria-label="Group" placeholder="Group" value={g.group} onChange={e => update({ skills: r.skills.map((y, j) => j === i ? { ...y, group: e.target.value } : y) })} />
            <input aria-label="Items, comma separated" placeholder="AWS, Kubernetes, Terraform" value={g.items.join(', ')} onChange={e => update({ skills: r.skills.map((y, j) => j === i ? { ...y, items: e.target.value.split(',').map(x => x.trimStart()) } : y) })} />
            <button type="button" className="icon-btn" aria-label="Remove group" onClick={() => update({ skills: r.skills.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
          </div>
        ))}
      </Group>
      {entries('experience', 'Experience')}
      {entries('projects', 'Projects')}
      <Group hidden={hidden} toggle={toggle} k="education" label="Education" onAdd={() => update({ education: [...r.education, { qualification: '', institution: '', period: '', details: '' }] })}>
        {r.education.map((x, i) => (
          <div key={i} className="ed__entry">
            <div className="grid-2">
              <input aria-label="Qualification" placeholder="Bachelor of …" value={x.qualification} onChange={e => update({ education: r.education.map((y, j) => j === i ? { ...y, qualification: e.target.value } : y) })} />
              <input aria-label="Period" placeholder="2024 – 2027" value={x.period} onChange={e => update({ education: r.education.map((y, j) => j === i ? { ...y, period: e.target.value } : y) })} />
            </div>
            <input aria-label="Institution" placeholder="Institution" value={x.institution} onChange={e => update({ education: r.education.map((y, j) => j === i ? { ...y, institution: e.target.value } : y) })} />
            <textarea aria-label="Details" rows={2} placeholder="CGPA 3.49 · Relevant subjects: …" value={x.details} onChange={e => update({ education: r.education.map((y, j) => j === i ? { ...y, details: e.target.value } : y) })} />
            <Tools onUp={() => update({ education: move(r.education, i, -1) })} onDown={() => update({ education: move(r.education, i, 1) })} onRemove={() => update({ education: r.education.filter((_, j) => j !== i) })} />
          </div>
        ))}
      </Group>
      {lines('awards', 'Awards', '2nd Place — Hari Inovasi Kebangsaan @Melaka 2026 (MediLink)')}
      <Group hidden={hidden} toggle={toggle} k="certifications" label="Certifications" onAdd={() => update({ certifications: [...r.certifications, { name: '', issuer: '', year: '' }] })}>
        {r.certifications.map((x, i) => (
          <div key={i} className="ed__cert">
            <input aria-label="Certification" placeholder="Certification" value={x.name} onChange={e => update({ certifications: r.certifications.map((y, j) => j === i ? { ...y, name: e.target.value } : y) })} />
            <input aria-label="Issuer" placeholder="Issuer" value={x.issuer} onChange={e => update({ certifications: r.certifications.map((y, j) => j === i ? { ...y, issuer: e.target.value } : y) })} />
            <input aria-label="Year" placeholder="Year" value={x.year} onChange={e => update({ certifications: r.certifications.map((y, j) => j === i ? { ...y, year: e.target.value } : y) })} />
            <div className="ed__tools">
              <button type="button" className="icon-btn" onClick={() => update({ certifications: move(r.certifications, i, -1) })} aria-label="Move up"><ArrowUp size={14} /></button>
              <button type="button" className="icon-btn" onClick={() => update({ certifications: r.certifications.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </Group>
      {lines('languages', 'Languages', 'English\nMalay')}
      <Group hidden={hidden} toggle={toggle} k="competencies" label="Programme outcomes (MQA)">
        <p className="muted small">Shows which programme learning outcomes your subjects prove. Most employers don't need this, so it is hidden by default.</p>
        {r.competencies.map((x, i) => (
          <div key={i} className="ed__skill">
            <input aria-label="Outcome" value={x.domain} onChange={e => update({ competencies: r.competencies.map((y, j) => j === i ? { ...y, domain: e.target.value } : y) })} />
            <input aria-label="Evidence" value={x.evidence} onChange={e => update({ competencies: r.competencies.map((y, j) => j === i ? { ...y, evidence: e.target.value } : y) })} />
            <button type="button" className="icon-btn" aria-label="Remove" onClick={() => update({ competencies: r.competencies.filter((_, j) => j !== i) })}><Trash2 size={14} /></button>
          </div>
        ))}
      </Group>
    </aside>
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
        <button className="btn btn--ghost btn--sm" onClick={async () => { if (dirty) await save(); navigate(`/print/resume/${doc.id}`); }}><Printer size={16} /> Download PDF</button>
        <button className="btn btn--primary btn--sm" onClick={save} disabled={!dirty}><Save size={16} /> Save</button>
      </div>
      <Notice>{err}</Notice>
      <div className="editor__view seg" role="tablist" aria-label="View">
        <button role="tab" className={view === 'edit' ? 'is-on' : ''} onClick={() => setView('edit')}>Edit</button>
        <button role="tab" className={view === 'preview' ? 'is-on' : ''} onClick={() => setView('preview')}>Preview</button>
      </div>
      <div className={`editor__body view-${view}`}>
        {editor}
        <div className="paper-wrap"><ResumeView r={r} template={doc.template} /></div>
      </div>
      {letter && <CoverLetter onClose={() => setLetter(false)} defaultJob={doc.job_ref ? `${doc.job_ref.title} at ${doc.job_ref.company}` : doc.target_role} />}
    </div>
  );
}

// Defined outside the editor so inputs keep focus while typing (a component created during render remounts every keystroke).
function Group({ k, label, children, onAdd, addLabel = 'Add', hidden, toggle }: { k: string; label: string; children: React.ReactNode; onAdd?: () => void; addLabel?: string; hidden: Set<string>; toggle: (k: string) => void }) {
  return (
    <fieldset className={`ed__group ${hidden.has(k) ? 'is-hidden' : ''}`}>
      <legend>{label}</legend>
      <button type="button" className="ed__vis" onClick={() => toggle(k)} aria-pressed={!hidden.has(k)} title={hidden.has(k) ? 'Show on resume' : 'Hide from resume'}>{hidden.has(k) ? <><EyeOff size={14} /> Hidden</> : <><Eye size={14} /> Shown</>}</button>
      {children}
      {onAdd && <button type="button" className="btn btn--ghost btn--sm" onClick={onAdd}><Plus size={14} /> {addLabel}</button>}
    </fieldset>
  );
}
function Tools({ onUp, onDown, onRemove }: { onUp: () => void; onDown: () => void; onRemove: () => void }) {
  return (
    <div className="ed__tools">
      <button type="button" className="icon-btn" onClick={onUp} aria-label="Move up"><ArrowUp size={14} /></button>
      <button type="button" className="icon-btn" onClick={onDown} aria-label="Move down"><ArrowDown size={14} /></button>
      <button type="button" className="btn btn--text danger" onClick={onRemove}><Trash2 size={14} /> Remove</button>
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
