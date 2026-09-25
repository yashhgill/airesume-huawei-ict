import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import type { Profile } from '../lib/types';
import { Card, Field, Notice, PageHead, Spinner, Tag } from '../components/ui';

const TABS = [
  { id: 'about', label: 'About' },
  { id: 'education', label: 'Education' },
  { id: 'skills', label: 'Skills' },
  { id: 'experience', label: 'Experience' },
  { id: 'certs', label: 'Certifications' },
  { id: 'import', label: 'Import CV' },
];

export function ProfilePage() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'about';
  const prof = useApi<Profile>('/me');

  return (
    <div className="page">
      <PageHead eyebrow="Profile" title="Your record" sub="Everything the AI writes comes from here, so keep it accurate." />
      <div className="tabs" role="tablist">
        {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-on' : ''} onClick={() => setSp({ tab: t.id })}>{t.label}</button>)}
      </div>
      {prof.loading && !prof.data ? <Spinner label="Loading profile" /> : prof.data && (
        <>
          {tab === 'about' && <About p={prof.data} onSaved={prof.reload} />}
          {tab === 'education' && <Education p={prof.data} reload={prof.reload} />}
          {tab === 'skills' && <Skills p={prof.data} reload={prof.reload} />}
          {tab === 'experience' && <Experience p={prof.data} reload={prof.reload} />}
          {tab === 'certs' && <Certs p={prof.data} reload={prof.reload} />}
          {tab === 'import' && <Import reload={prof.reload} />}
        </>
      )}
    </div>
  );
}

function About({ p, onSaved }: { p: Profile; onSaved: () => void }) {
  const [f, setF] = useState({ name: p.user.name, headline: p.user.headline ?? '', phone: p.user.phone ?? '', location: p.user.location ?? '', linkedin: p.user.linkedin ?? '', github: p.user.github ?? '', website: p.user.website ?? '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setMsg('');
    try { await api('/me', { method: 'PUT', body: f }); setMsg('Saved.'); onSaved(); } catch (x) { setErr((x as Error).message); }
  };
  return (
    <Card>
      <form className="form-grid" onSubmit={save}>
        <Field label="Full name"><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Headline" hint="e.g. Final-year Cloud Computing student"><input value={f.headline} onChange={set('headline')} /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} placeholder="+60 12-345 6789" /></Field>
        <Field label="Location"><input value={f.location} onChange={set('location')} placeholder="Melaka, Malaysia" /></Field>
        <Field label="LinkedIn"><input value={f.linkedin} onChange={set('linkedin')} placeholder="linkedin.com/in/…" /></Field>
        <Field label="GitHub"><input value={f.github} onChange={set('github')} placeholder="github.com/…" /></Field>
        <Field label="Website / portfolio"><input value={f.website} onChange={set('website')} /></Field>
        <div className="form-grid__foot"><Notice>{err}</Notice><Notice tone="ok">{msg}</Notice><button className="btn btn--primary">Save profile</button></div>
      </form>
    </Card>
  );
}

function Education({ p, reload }: { p: Profile; reload: () => void }) {
  const [f, setF] = useState({ institution: '', qualification: '', start_year: '', end_year: '', cgpa: '' });
  const [err, setErr] = useState('');
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    try { await api('/profile/education', { body: f }); setF({ institution: '', qualification: '', start_year: '', end_year: '', cgpa: '' }); reload(); } catch (x) { setErr((x as Error).message); }
  };
  return (
    <div className="grid-2">
      <Card title="Education" actions={<Link className="btn btn--text" to="/app/start">Change programme & subjects</Link>}>
        {p.education.length === 0 && <p className="muted">No education yet. <Link to="/app/start">Pick your programme</Link> to map subjects.</p>}
        <ul className="rows">
          {p.education.map(e => (
            <li key={e.id}>
              <div><b>{e.qualification}</b><span>{e.institution} · {e.start_year ?? '?'}–{e.end_year ?? 'present'}{e.cgpa ? ` · CGPA ${e.cgpa}` : ''}</span></div>
              <button className="icon-btn" aria-label="Remove" onClick={async () => { await api(`/profile/education/${e.id}`, { method: 'DELETE' }); reload(); }}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
        {p.subjects.length > 0 && <>
          <h3 className="mt">Subjects completed ({p.subjects.length})</h3>
          <div className="chips">{p.subjects.map(s => <Tag key={s.id}>{s.name}</Tag>)}</div>
        </>}
      </Card>
      <Card title="Add other education" eyebrow="Diploma, foundation, SPM…">
        <form className="stack" onSubmit={add}>
          <Field label="Qualification"><input value={f.qualification} onChange={e => setF({ ...f, qualification: e.target.value })} placeholder="Diploma in Information Technology" required /></Field>
          <Field label="Institution"><input value={f.institution} onChange={e => setF({ ...f, institution: e.target.value })} required /></Field>
          <div className="grid-3">
            <Field label="Start"><input value={f.start_year} onChange={e => setF({ ...f, start_year: e.target.value })} inputMode="numeric" /></Field>
            <Field label="End"><input value={f.end_year} onChange={e => setF({ ...f, end_year: e.target.value })} inputMode="numeric" /></Field>
            <Field label="CGPA"><input value={f.cgpa} onChange={e => setF({ ...f, cgpa: e.target.value })} inputMode="decimal" /></Field>
          </div>
          <Notice>{err}</Notice>
          <button className="btn btn--primary"><Plus size={16} /> Add education</button>
        </form>
      </Card>
    </div>
  );
}

const LEVELS = ['', 'Aware', 'Beginner', 'Can apply', 'Strong', 'Expert'];

function Skills({ p, reload }: { p: Profile; reload: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Technical');
  const [level, setLevel] = useState(3);
  const [sugg, setSugg] = useState<{ name: string; category: string; level: number; evidence: string }[]>([]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const groups = ['Technical', 'Tool', 'Soft', 'Language'];

  const add = async (e: React.FormEvent) => { e.preventDefault(); if (!name.trim()) return; await api('/profile/skills', { body: { name, category, level } }); setName(''); reload(); };
  const fromSubjects = async () => { setBusy('sub'); setErr(''); try { await api('/profile/skills/from-subjects', { body: {} }); reload(); } catch (x) { setErr((x as Error).message); } finally { setBusy(''); } };
  const suggest = async () => { setBusy('ai'); setErr(''); try { setSugg((await api<{ suggestions: typeof sugg }>('/ai/skills', { body: {} })).suggestions); } catch (x) { setErr((x as Error).message); } finally { setBusy(''); } };
  const accept = async (s: typeof sugg[number]) => { await api('/profile/skills', { body: { ...s, source: 'ai' } }); setSugg(sugg.filter(x => x !== s)); reload(); };

  return (
    <div className="grid-2 grid-2--wide-left">
      <Card title={`${p.skills.length} skills`} actions={<div className="row"><button className="btn btn--ghost" onClick={fromSubjects} disabled={!!busy}>{busy === 'sub' ? 'Adding…' : 'Add from subjects'}</button><button className="btn btn--primary" onClick={suggest} disabled={!!busy}><Sparkles size={16} /> {busy === 'ai' ? 'Thinking…' : 'AI suggest'}</button></div>}>
        <Notice>{err}</Notice>
        {groups.map(g => {
          const list = p.skills.filter(s => s.category === g);
          if (!list.length) return null;
          return (
            <div key={g} className="stack-sm">
              <p className="eyebrow">{g}</p>
              <ul className="skill-list">
                {list.map(s => (
                  <li key={s.id}>
                    <div><b>{s.name}</b>{s.evidence && <span>{s.evidence}</span>}</div>
                    <span className="dots" title={LEVELS[s.level]}>{[1, 2, 3, 4, 5].map(i => <i key={i} className={i <= s.level ? 'on' : ''} />)}</span>
                    <Tag tone={s.source === 'subject' ? 'info' : s.source === 'ai' ? 'accent' : 'plain'}>{s.source}</Tag>
                    <button className="icon-btn" aria-label={`Remove ${s.name}`} onClick={async () => { await api(`/profile/skills/${s.id}`, { method: 'DELETE' }); reload(); }}><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {!p.skills.length && <p className="muted">No skills yet. Add them from your subjects or type one on the right.</p>}
      </Card>
      <div className="stack">
        <Card title="Add a skill">
          <form className="stack" onSubmit={add}>
            <Field label="Skill"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Docker" /></Field>
            <div className="grid-2">
              <Field label="Type"><select value={category} onChange={e => setCategory(e.target.value)}>{groups.map(g => <option key={g}>{g}</option>)}</select></Field>
              <Field label={`Level · ${LEVELS[level]}`}><input type="range" min={1} max={5} value={level} onChange={e => setLevel(Number(e.target.value))} /></Field>
            </div>
            <button className="btn btn--primary"><Plus size={16} /> Add skill</button>
          </form>
        </Card>
        {sugg.length > 0 && (
          <Card eyebrow="AI suggestions" title="Tap to keep">
            <ul className="evidence">
              {sugg.map(s => <li key={s.name}><button className="linkish" onClick={() => accept(s)}><b>+ {s.name}</b></button><span>{s.category} · {LEVELS[s.level]} · {s.evidence}</span></li>)}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

const KINDS = [{ v: 'internship', l: 'Internship' }, { v: 'work', l: 'Work' }, { v: 'project', l: 'Project' }, { v: 'activity', l: 'Club / activity' }];

function Experience({ p, reload }: { p: Profile; reload: () => void }) {
  const blank = { kind: 'project', title: '', organisation: '', start_date: '', end_date: '', description: '' };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const add = async (e: React.FormEvent) => { e.preventDefault(); setErr(''); try { await api('/profile/experiences', { body: f }); setF(blank); reload(); } catch (x) { setErr((x as Error).message); } };
  return (
    <div className="grid-2">
      <Card title="Experience & projects">
        {!p.experiences.length && <p className="muted">Internships, part-time jobs, final year project, club roles. They evidence teamwork, leadership and practical PLOs.</p>}
        <ul className="rows">
          {p.experiences.map(x => (
            <li key={x.id}>
              <div><b>{x.title}</b><span>{KINDS.find(k => k.v === x.kind)?.l}{x.organisation ? ` · ${x.organisation}` : ''}{x.start_date ? ` · ${x.start_date}–${x.end_date || 'present'}` : ''}</span>{x.description && <p>{x.description}</p>}</div>
              <button className="icon-btn" aria-label="Remove" onClick={async () => { await api(`/profile/experiences/${x.id}`, { method: 'DELETE' }); reload(); }}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Add experience">
        <form className="stack" onSubmit={add}>
          <div className="seg">{KINDS.map(k => <button type="button" key={k.v} className={f.kind === k.v ? 'is-on' : ''} onClick={() => setF({ ...f, kind: k.v })}>{k.l}</button>)}</div>
          <Field label="Title / role"><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Cloud Intern, FYP: Smart Odour Monitoring…" required /></Field>
          <Field label="Organisation"><input value={f.organisation} onChange={e => setF({ ...f, organisation: e.target.value })} /></Field>
          <div className="grid-2">
            <Field label="From"><input value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} placeholder="2025-03" /></Field>
            <Field label="To"><input value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} placeholder="2025-08 or blank" /></Field>
          </div>
          <Field label="What you did" hint="Plain notes are fine. The AI turns them into resume bullets without adding anything."><textarea rows={4} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
          <Notice>{err}</Notice>
          <button className="btn btn--primary"><Plus size={16} /> Add</button>
        </form>
      </Card>
    </div>
  );
}

function Certs({ p, reload }: { p: Profile; reload: () => void }) {
  const [f, setF] = useState({ name: '', issuer: '', year: '', url: '' });
  const add = async (e: React.FormEvent) => { e.preventDefault(); await api('/profile/certifications', { body: f }); setF({ name: '', issuer: '', year: '', url: '' }); reload(); };
  return (
    <div className="grid-2">
      <Card title="Certifications">
        {!p.certifications.length && <p className="muted">None yet. Huawei HCIA certifications are a strong signal for cloud roles in Malaysia.</p>}
        <ul className="rows">{p.certifications.map(c => <li key={c.id}><div><b>{c.name}</b><span>{[c.issuer, c.year].filter(Boolean).join(' · ')}</span></div><button className="icon-btn" aria-label="Remove" onClick={async () => { await api(`/profile/certifications/${c.id}`, { method: 'DELETE' }); reload(); }}><Trash2 size={16} /></button></li>)}</ul>
      </Card>
      <Card title="Add certification">
        <form className="stack" onSubmit={add}>
          <Field label="Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="HCIA-Cloud Computing" required /></Field>
          <div className="grid-2">
            <Field label="Issuer"><input value={f.issuer} onChange={e => setF({ ...f, issuer: e.target.value })} placeholder="Huawei" /></Field>
            <Field label="Year"><input value={f.year} onChange={e => setF({ ...f, year: e.target.value })} /></Field>
          </div>
          <Field label="Credential link"><input value={f.url} onChange={e => setF({ ...f, url: e.target.value })} /></Field>
          <button className="btn btn--primary"><Plus size={16} /> Add</button>
        </form>
      </Card>
    </div>
  );
}

type Draft = { name?: string; phone?: string; location?: string; headline?: string; education: { qualification: string; institution: string; start_year?: number; end_year?: number }[]; skills: { name: string; category: string }[]; experiences: { kind: string; title: string; organisation?: string; start_date?: string; end_date?: string }[]; certifications: { name: string; issuer?: string }[] };

function Import({ reload }: { reload: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  useEffect(() => { setDone(''); }, [draft]);

  const upload = async (file: File) => {
    setBusy(true); setErr('');
    const form = new FormData(); form.append('file', file);
    try { setDraft((await api<{ draft: Draft }>('/ai/import', { form })).draft); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const fromText = async () => { setBusy(true); setErr(''); try { setDraft((await api<{ draft: Draft }>('/ai/import', { body: { text } })).draft); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } };
  const apply = async () => { setBusy(true); try { const r = await api<{ records: number }>('/profile/import', { body: draft }); setDone(`Added ${r.records} records to your profile.`); setDraft(null); reload(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } };

  return (
    <div className="grid-2">
      <Card title="Import an existing CV" eyebrow="PDF or text">
        <label className="drop">
          <Upload size={24} />
          <b>{busy ? 'Reading your CV…' : 'Choose a PDF'}</b>
          <span>Up to 5 MB. Text-based PDFs work best.</span>
          <input type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} disabled={busy} />
        </label>
        <Field label="…or paste the text"><textarea rows={6} value={text} onChange={e => setText(e.target.value)} /></Field>
        <button className="btn btn--ghost" onClick={fromText} disabled={busy || text.trim().length < 40}>Read pasted text</button>
        <Notice>{err}</Notice><Notice tone="ok">{done}</Notice>
      </Card>
      <Card title="Review before adding" eyebrow="Nothing is saved until you confirm">
        {busy && <Spinner label="Extracting" />}
        {!draft && !busy && <p className="muted">After you upload, the extracted education, skills and experience appear here for you to check.</p>}
        {draft && (
          <div className="stack">
            {draft.education?.length > 0 && <div><p className="eyebrow">Education</p><ul className="list">{draft.education.map((e, i) => <li key={i}>{e.qualification} · {e.institution}</li>)}</ul></div>}
            {draft.experiences?.length > 0 && <div><p className="eyebrow">Experience</p><ul className="list">{draft.experiences.map((e, i) => <li key={i}>{e.title}{e.organisation ? ` · ${e.organisation}` : ''}</li>)}</ul></div>}
            {draft.skills?.length > 0 && <div><p className="eyebrow">Skills</p><div className="chips">{draft.skills.map(s => <Tag key={s.name}>{s.name}</Tag>)}</div></div>}
            {draft.certifications?.length > 0 && <div><p className="eyebrow">Certifications</p><ul className="list">{draft.certifications.map((c, i) => <li key={i}>{c.name}</li>)}</ul></div>}
            <div className="row"><button className="btn btn--primary" onClick={apply} disabled={busy}>Add to my profile</button><button className="btn btn--ghost" onClick={() => setDraft(null)}>Discard</button></div>
          </div>
        )}
      </Card>
    </div>
  );
}
