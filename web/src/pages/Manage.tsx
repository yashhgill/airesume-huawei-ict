import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2, Check, ChevronRight, Copy, Download, GraduationCap, History, Layers, LayoutDashboard, Pencil, Plus, Sparkles, Trash2, Upload, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Card, Empty, Field, Meter, Modal, Notice, PageHead, Spinner, Tag } from '../components/ui';

type MyRole = 'platform' | 'uni_admin' | 'faculty_admin' | 'coordinator' | null;
interface Prog { id: number; faculty_id: number; name: string; code: string | null; level: string; mqa_code: string | null; active: number; subjects: number; plos: number; students: number; my: MyRole }
interface Fac { id: number; institution_id: number; name: string; short_name: string | null; active: number; my: MyRole; programmes: Prog[] }
interface Inst { id: number; name: string; short_name: string | null; city: string | null; email_domain: string | null; active: number; my: MyRole; faculties: Fac[] }
type Scope = { institution_id?: number; faculty_id?: number; programme_id?: number };

const RANK: Record<string, number> = { platform: 4, uni_admin: 3, faculty_admin: 2, coordinator: 1 };
const at = (my: MyRole, min: keyof typeof RANK) => !!my && RANK[my] >= RANK[min];
const ROLE_TAG: Record<string, string> = { platform: 'Platform admin', uni_admin: 'University admin', faculty_admin: 'Faculty admin', coordinator: 'Coordinator' };
const qs = (s: Scope) => new URLSearchParams(Object.entries(s).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString();

function useTree() { return useApi<Inst[]>('/org/tree'); }

function Crumbs({ items }: { items: { to?: string; label: string }[] }) {
  return <nav className="crumbs" aria-label="Breadcrumb">{items.map((c, i) => <span key={i}>{c.to ? <Link to={c.to}>{c.label}</Link> : <b>{c.label}</b>}{i < items.length - 1 && <ChevronRight size={14} />}</span>)}</nav>;
}

function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string, typeof Users][] }) {
  return <div className="tabs" role="tablist">{items.map(([id, l, Icon]) => <button key={id} role="tab" aria-selected={value === id} className={value === id ? 'is-on' : ''} onClick={() => onChange(id)}><Icon size={15} /> {l}</button>)}</div>;
}

// ── Landing: universities I can see ────────────────────────────────────────
export function ManageHome() {
  const tree = useTree();
  const me = useApi<{ platform: boolean; assignments: { role: string; label: string; institution_id: number | null; faculty_id: number | null; programme_id: number | null; institution: string | null; faculty: string | null; programme: string | null }[] }>('/org/me');
  const nav = useNavigate();
  const [add, setAdd] = useState(false);
  useEffect(() => {   // staff with one job go straight to it
    if (!me.data || me.data.platform || me.data.assignments.length !== 1) return;
    const a = me.data.assignments[0];
    nav(a.role === 'coordinator' ? `/app/manage/p/${a.programme_id}` : a.role === 'faculty_admin' ? `/app/manage/f/${a.faculty_id}` : `/app/manage/u/${a.institution_id}`, { replace: true });
  }, [me.data, nav]);
  if (tree.error || me.error) return <div className="page"><Notice>{tree.error ?? me.error}</Notice></div>;
  if (!tree.data || !me.data) return <div className="page"><Spinner label="Loading" /></div>;
  return (
    <div className="page">
      <PageHead eyebrow="Manage" title="Universities" sub="Each university runs its own faculties, degrees and curriculum. Staff only see and edit their own part."
        actions={me.data.platform && <button className="btn btn--primary" onClick={() => setAdd(true)}><Plus size={16} /> Add university</button>} />
      {me.data.assignments.length > 0 && <div className="chips">{me.data.assignments.map((a, i) => <Tag key={i} tone="accent">{a.label} · {a.programme ?? a.faculty ?? a.institution}</Tag>)}</div>}
      <div className="org-grid">
        {tree.data.map(u => (
          <Link key={u.id} to={`/app/manage/u/${u.id}`} className="org-card">
            <span className="org-card__icon c1"><Building2 size={20} /></span>
            <div><b>{u.name}</b><span>{[u.short_name, u.city, u.email_domain].filter(Boolean).join(' · ')}</span></div>
            <div className="org-card__stats"><span><b>{u.faculties.length}</b> faculties</span><span><b>{u.faculties.reduce((n, f) => n + f.programmes.length, 0)}</b> degrees</span></div>
            {!u.active && <Tag tone="warn">Hidden</Tag>}
          </Link>
        ))}
      </div>
      {add && <EntityModal kind="institution" onClose={() => setAdd(false)} onSaved={id => nav(`/app/manage/u/${id}`)} />}
    </div>
  );
}

// ── University ─────────────────────────────────────────────────────────────
export function ManageUniversity() {
  const id = Number(useParams().id);
  const tree = useTree();
  const [tab, setTab] = useState<'overview' | 'faculties' | 'staff' | 'log'>('overview');
  const [modal, setModal] = useState<'faculty' | 'edit' | null>(null);
  const u = tree.data?.find(x => x.id === id);
  useEffect(() => { if (u && !u.my) setTab('faculties'); }, [u]);
  if (tree.loading && !tree.data) return <div className="page"><Spinner /></div>;
  if (!u) return <div className="page"><Notice>University not found or not yours to manage.</Notice></div>;
  const admin = at(u.my, 'uni_admin');
  return (
    <div className="page">
      <Crumbs items={[{ to: '/app/manage', label: 'Universities' }, { label: u.short_name ?? u.name }]} />
      <PageHead eyebrow={u.my ? ROLE_TAG[u.my] : 'University'} title={u.name} sub={[u.city, u.email_domain && `Students sign up with @${u.email_domain}`].filter(Boolean).join(' · ')}
        actions={admin && <><button className="btn btn--ghost btn--sm" onClick={() => setModal('edit')}><Pencil size={14} /> Edit</button><button className="btn btn--primary btn--sm" onClick={() => setModal('faculty')}><Plus size={14} /> Faculty</button></>} />
      <Tabs value={tab} onChange={setTab} items={u.my ? [['overview', 'Overview', LayoutDashboard], ['faculties', `Faculties · ${u.faculties.length}`, Layers], ['staff', 'Staff', Users], ['log', 'Changes', History]] : [['faculties', `Faculties · ${u.faculties.length}`, Layers]]} />
      {tab === 'overview' && <Insights scope={{ institution_id: id }} />}
      {tab === 'faculties' && (
        u.faculties.length ? <div className="org-grid">{u.faculties.map(f => (
          <Link key={f.id} to={`/app/manage/f/${f.id}`} className="org-card">
            <span className="org-card__icon c2"><Layers size={20} /></span>
            <div><b>{f.short_name ?? f.name}</b><span>{f.short_name ? f.name : ''}</span></div>
            <div className="org-card__stats"><span><b>{f.programmes.length}</b> degrees</span><span><b>{f.programmes.reduce((n, p) => n + p.students, 0)}</b> students</span></div>
            {!f.active && <Tag tone="warn">Hidden</Tag>}
          </Link>
        ))}</div> : <Empty icon={<Layers />} title="No faculties yet">{admin && <button className="btn btn--primary" onClick={() => setModal('faculty')}><Plus size={15} /> Add the first faculty</button>}</Empty>
      )}
      {tab === 'staff' && <Staff scope={{ institution_id: id }} />}
      {tab === 'log' && <Log scope={{ institution_id: id }} />}
      {modal === 'faculty' && <EntityModal kind="faculty" parent={id} onClose={() => setModal(null)} onSaved={() => { tree.reload(); setTab('faculties'); }} />}
      {modal === 'edit' && <EntityModal kind="institution" item={u} onClose={() => setModal(null)} onSaved={() => tree.reload()} />}
    </div>
  );
}

// ── Faculty ────────────────────────────────────────────────────────────────
export function ManageFaculty() {
  const id = Number(useParams().id);
  const tree = useTree();
  const [tab, setTab] = useState<'overview' | 'programmes' | 'staff' | 'log'>('programmes');
  const [modal, setModal] = useState<'programme' | 'edit' | null>(null);
  const u = tree.data?.find(x => x.faculties.some(f => f.id === id));
  const f = u?.faculties.find(x => x.id === id);
  if (tree.loading && !tree.data) return <div className="page"><Spinner /></div>;
  if (!u || !f) return <div className="page"><Notice>Faculty not found or not yours to manage.</Notice></div>;
  const admin = at(f.my, 'faculty_admin');
  return (
    <div className="page">
      <Crumbs items={[{ to: '/app/manage', label: 'Universities' }, { to: `/app/manage/u/${u.id}`, label: u.short_name ?? u.name }, { label: f.short_name ?? f.name }]} />
      <PageHead eyebrow={f.my ? ROLE_TAG[f.my] : 'Faculty'} title={f.name}
        actions={admin && <>{at(f.my, 'uni_admin') && <button className="btn btn--ghost btn--sm" onClick={() => setModal('edit')}><Pencil size={14} /> Edit</button>}<button className="btn btn--primary btn--sm" onClick={() => setModal('programme')}><Plus size={14} /> Degree</button></>} />
      <Tabs value={tab} onChange={setTab} items={f.my ? [['programmes', `Degrees · ${f.programmes.length}`, GraduationCap], ['overview', 'Overview', LayoutDashboard], ['staff', 'Staff', Users], ['log', 'Changes', History]] : [['programmes', `Degrees · ${f.programmes.length}`, GraduationCap]]} />
      {tab === 'overview' && <Insights scope={{ faculty_id: id }} />}
      {tab === 'programmes' && (
        f.programmes.length ? <div className="prog-list">{f.programmes.map(p => (
          <Link key={p.id} to={`/app/manage/p/${p.id}`} className="prog-row">
            <span className="org-card__icon c1"><GraduationCap size={18} /></span>
            <div><b>{p.name}</b><span>{[p.level, p.mqa_code].filter(Boolean).join(' · ')}</span></div>
            <div className="prog-row__stats">
              <span className={p.subjects ? '' : 'warn'}><b>{p.subjects}</b> subjects</span>
              <span><b>{p.plos}</b> PLOs</span>
              <span><b>{p.students}</b> students</span>
            </div>
            {!p.active && <Tag tone="warn">Hidden</Tag>}
            <ChevronRight size={18} className="muted" />
          </Link>
        ))}</div> : <Empty icon={<GraduationCap />} title="No degrees yet">{admin && <button className="btn btn--primary" onClick={() => setModal('programme')}><Plus size={15} /> Add a degree</button>}</Empty>
      )}
      {tab === 'staff' && <Staff scope={{ faculty_id: id }} programmes={f.programmes} />}
      {tab === 'log' && <Log scope={{ faculty_id: id }} />}
      {modal === 'programme' && <EntityModal kind="programme" parent={id} siblings={f.programmes} onClose={() => setModal(null)} onSaved={() => { tree.reload(); setTab('programmes'); }} />}
      {modal === 'edit' && <EntityModal kind="faculty" item={f} onClose={() => setModal(null)} onSaved={() => tree.reload()} />}
    </div>
  );
}

// ── Programme: the coordinator's workspace ─────────────────────────────────
interface Subject { id: number; code: string | null; name: string; year: number | null; semester: number | null; credits: number | null; clos: string[]; plo_codes: string[]; skills: string[] }
interface Plo { id: number; code: string; domain: string | null; description: string }
interface ProgDetail { programme: Prog & { faculty: string; faculty_id: number; institution: string; institution_id: number; duration_years: number }; my: MyRole; plos: Plo[]; subjects: Subject[] }

export function ManageProgramme() {
  const id = Number(useParams().id);
  const d = useApi<ProgDetail>(`/org/programmes/${id}`);
  const [tab, setTab] = useState<'subjects' | 'plos' | 'overview' | 'staff' | 'log'>('subjects');
  const [edit, setEdit] = useState<Subject | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [editProg, setEditProg] = useState(false);
  const [q, setQ] = useState('');
  if (d.loading && !d.data) return <div className="page"><Spinner label="Loading curriculum" /></div>;
  if (d.error || !d.data) return <div className="page"><Notice>{d.error ?? 'Not found'}</Notice></div>;
  const { programme: p, plos, subjects, my } = d.data;
  const covered = new Set(subjects.flatMap(s => s.plo_codes));
  const unmapped = plos.filter(x => !covered.has(x.code));
  const shown = subjects.filter(s => !q || `${s.code} ${s.name} ${s.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  const years = [...new Set(shown.map(s => s.year ?? 0))].sort();

  return (
    <div className="page">
      <Crumbs items={[{ to: '/app/manage', label: 'Universities' }, { to: `/app/manage/u/${p.institution_id}`, label: p.institution }, { to: `/app/manage/f/${p.faculty_id}`, label: p.faculty.replace(/^Fakulti |^Faculty of /, '') }, { label: 'Degree' }]} />
      <PageHead eyebrow={my ? ROLE_TAG[my] : 'Degree'} title={p.name} sub={[p.level, p.mqa_code, `${p.duration_years ?? 4} years`].filter(Boolean).join(' · ')}
        actions={at(my, 'faculty_admin') && <button className="btn btn--ghost btn--sm" onClick={() => setEditProg(true)}><Pencil size={14} /> Edit degree</button>} />

      <div className="health">
        <div className={subjects.length ? 'ok' : 'bad'}><b>{subjects.length}</b><span>subjects</span></div>
        <div className={unmapped.length ? 'warn' : 'ok'}><b>{plos.length - unmapped.length}/{plos.length}</b><span>PLOs covered by a subject</span></div>
        <div className={subjects.some(s => !s.clos.length) ? 'warn' : 'ok'}><b>{subjects.filter(s => s.clos.length).length}</b><span>with CLOs</span></div>
        <div className={subjects.some(s => !s.skills.length) ? 'warn' : 'ok'}><b>{subjects.filter(s => s.skills.length).length}</b><span>with skills</span></div>
      </div>
      {unmapped.length > 0 && <Notice tone="info">No subject evidences {unmapped.map(x => x.code).join(', ')} yet. Students cannot show these outcomes until a subject maps to them.</Notice>}

      <Tabs value={tab} onChange={setTab} items={[['subjects', `Subjects · ${subjects.length}`, Layers], ['plos', `PLOs · ${plos.length}`, GraduationCap], ['overview', 'Students', LayoutDashboard], ['staff', 'Coordinators', Users], ['log', 'Changes', History]]} />

      {tab === 'subjects' && (
        <div className="stack">
          <div className="toolbar">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search subjects or skills" aria-label="Search subjects" />
            <button className="btn btn--ghost btn--sm" onClick={() => setImporting(true)}><Upload size={14} /> Import</button>
            <button className="btn btn--primary btn--sm" onClick={() => setEdit('new')}><Plus size={14} /> Subject</button>
          </div>
          {!subjects.length ? <Empty icon={<Layers />} title="No subjects yet"><p>Add them one by one, or import the whole programme structure from a spreadsheet.</p><div className="row"><button className="btn btn--primary" onClick={() => setImporting(true)}><Upload size={15} /> Import spreadsheet</button><button className="btn btn--ghost" onClick={() => setEdit('new')}>Add one</button></div></Empty>
            : years.map(y => (
              <section key={y} className="stack-sm">
                <p className="eyebrow">{y ? `Year ${y}` : 'Year not set'}</p>
                <div className="subj-list">
                  {shown.filter(s => (s.year ?? 0) === y).map(s => (
                    <button key={s.id} className="subj" onClick={() => setEdit(s)}>
                      <div className="subj__top"><span className="mono">{s.code ?? '—'}</span><b>{s.name}</b>{s.credits ? <span className="muted small">{s.credits} cr</span> : null}</div>
                      <div className="chips">{s.plo_codes.map(c => <Tag key={c} tone="info">{c}</Tag>)}{s.skills.slice(0, 4).map(k => <Tag key={k}>{k}</Tag>)}{s.skills.length > 4 && <Tag>+{s.skills.length - 4}</Tag>}</div>
                      <span className="subj__meta">{s.clos.length} CLO{s.clos.length === 1 ? '' : 's'}{!s.clos.length && ' · add CLOs'}{!s.plo_codes.length && ' · not mapped to a PLO'}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
      {tab === 'plos' && <Plos id={id} plos={plos} subjects={subjects} reload={d.reload} />}
      {tab === 'overview' && <Insights scope={{ programme_id: id }} />}
      {tab === 'staff' && <Staff scope={{ programme_id: id }} />}
      {tab === 'log' && <Log scope={{ programme_id: id }} />}
      {edit && <SubjectModal programmeId={id} subject={edit === 'new' ? null : edit} plos={plos} onClose={() => setEdit(null)} onSaved={d.reload} />}
      {importing && <ImportModal programmeId={id} onClose={() => setImporting(false)} onDone={d.reload} />}
      {editProg && <EntityModal kind="programme" item={p} onClose={() => setEditProg(false)} onSaved={d.reload} />}
    </div>
  );
}

function SubjectModal({ programmeId, subject, plos, onClose, onSaved }: { programmeId: number; subject: Subject | null; plos: Plo[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ code: subject?.code ?? '', name: subject?.name ?? '', year: subject?.year ?? 1, semester: subject?.semester ?? '', credits: subject?.credits ?? 3, clos: (subject?.clos ?? []).join('\n'), skills: (subject?.skills ?? []).join(', ') });
  const [codes, setCodes] = useState<string[]>(subject?.plo_codes ?? []);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [hint, setHint] = useState('');
  const body = () => ({ ...f, clos: f.clos.split('\n'), skills: f.skills.split(/[,;\n]/), plo_codes: codes });
  const save = async () => {
    setBusy('save'); setErr('');
    try { await api(subject ? `/org/subjects/${subject.id}` : `/org/programmes/${programmeId}/subjects`, { method: subject ? 'PUT' : 'POST', body: body() }); onSaved(); onClose(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };
  const remove = async () => { if (!subject || !confirm(`Delete ${subject.name}? Students who ticked it lose its evidence.`)) return; await api(`/org/subjects/${subject.id}`, { method: 'DELETE' }); onSaved(); onClose(); };
  const suggest = async () => {
    setBusy('ai'); setErr('');
    try {
      const r = await api<{ plo_codes: string[]; skills: string[]; notes: string }>(`/org/programmes/${programmeId}/ai-map`, { body: body() });
      setCodes(r.plo_codes);
      const have = new Set(f.skills.split(/[,;]/).map(x => x.trim().toLowerCase()).filter(Boolean));
      setF(x => ({ ...x, skills: [...x.skills.split(/[,;]/).map(s => s.trim()).filter(Boolean), ...r.skills.filter(s => !have.has(s.toLowerCase()))].join(', ') }));
      setHint(r.notes);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };
  return (
    <Modal title={subject ? 'Edit subject' : 'Add subject'} onClose={onClose} wide>
      <div className="form-grid">
        <Field label="Code"><input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="BITS 2513" /></Field>
        <Field label="Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Year"><input type="number" min={1} max={6} value={f.year} onChange={e => setF({ ...f, year: Number(e.target.value) })} /></Field>
        <Field label="Credits"><input type="number" min={0} max={20} value={f.credits} onChange={e => setF({ ...f, credits: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Course learning outcomes (one per line)" hint="Students get evidence from these. Start each with a verb: Apply…, Design…, Evaluate…"><textarea rows={4} value={f.clos} onChange={e => setF({ ...f, clos: e.target.value })} /></Field>
      <div className="field">
        <div className="row between"><span className="field__label">Programme outcomes this subject evidences</span><button className="btn btn--ghost btn--sm" onClick={suggest} disabled={!!busy || !f.clos.trim()}><Sparkles size={14} /> {busy === 'ai' ? 'Mapping…' : 'Suggest with AI'}</button></div>
        <div className="plo-pick">{plos.map(p => <button key={p.code} type="button" title={p.description} className={`chip ${codes.includes(p.code) ? 'chip--on' : ''}`} onClick={() => setCodes(c => c.includes(p.code) ? c.filter(x => x !== p.code) : [...c, p.code])}>{codes.includes(p.code) && <Check size={12} />} {p.code} <span className="muted">{p.domain}</span></button>)}</div>
        {hint && <span className="field__hint"><Sparkles size={11} /> {hint}</span>}
      </div>
      <Field label="Skills it builds (comma separated)" hint="Concrete terms an employer would search for: SQL, Docker, Figma, Agile…"><input value={f.skills} onChange={e => setF({ ...f, skills: e.target.value })} /></Field>
      <Notice>{err}</Notice>
      <div className="row between">{subject ? <button className="btn btn--text danger" onClick={remove}><Trash2 size={14} /> Delete</button> : <span />}<button className="btn btn--primary" onClick={save} disabled={!!busy || !f.name.trim()}>{busy === 'save' ? 'Saving…' : 'Save subject'}</button></div>
    </Modal>
  );
}

const TEMPLATE = 'code,name,year,semester,credits,clos,plos,skills\nBITS 2513,Cloud Computing Fundamentals,2,1,3,"Explain cloud service models; Deploy a virtual machine",PLO1;PLO3,"Huawei Cloud ECS; Virtualisation"\n';

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',' || ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const head = (rows.shift() ?? []).map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
  const idx = (...names: string[]) => head.findIndex(h => names.includes(h));
  const col = { code: idx('code', 'subjectcode', 'kod'), name: idx('name', 'subject', 'subjectname', 'nama'), year: idx('year', 'tahun'), semester: idx('semester', 'sem'), credits: idx('credits', 'credit', 'kredit'), clos: idx('clos', 'clo', 'courselearningoutcomes'), plos: idx('plos', 'plo', 'plocodes'), skills: idx('skills', 'skill') };
  return rows.filter(r => r.some(c => c.trim())).map(r => {
    const g = (k: keyof typeof col) => (col[k] >= 0 ? (r[col[k]] ?? '').trim() : '');
    return { code: g('code'), name: g('name'), year: g('year'), semester: g('semester'), credits: g('credits'), clos: g('clos').split(/;|\n/), plo_codes: g('plos').split(/[;, ]+/), skills: g('skills').split(/;/) };
  }).filter(r => r.name);
}

function ImportModal({ programmeId, onClose, onDone }: { programmeId: number; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<ReturnType<typeof parseCsv>>([]);
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const read = (t: string) => { setText(t); try { setRows(parseCsv(t)); setErr(''); } catch { setErr('Could not read that file.'); } };
  const go = async () => {
    setBusy(true); setErr('');
    try { const r = await api<{ added: number; updated: number }>(`/org/programmes/${programmeId}/subjects/import`, { body: { rows, replace } }); setDone(`${r.added} added, ${r.updated} updated.`); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Import subjects" onClose={onClose} wide>
      <p className="muted small">Export the programme structure from Excel or Google Sheets as CSV. Columns: <span className="mono">code, name, year, semester, credits, clos, plos, skills</span>. Separate several CLOs, PLOs or skills with a semicolon. Subjects with a matching code are updated, new ones are added.</p>
      <div className="row">
        <a className="btn btn--ghost btn--sm" download="pathforward-subjects-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}><Download size={14} /> Template</a>
        <label className="btn btn--primary btn--sm"><Upload size={14} /> Choose CSV<input type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={async e => { const f = e.target.files?.[0]; if (f) read(await f.text()); }} /></label>
      </div>
      <Field label="…or paste rows from a spreadsheet"><textarea rows={4} value={text} onChange={e => read(e.target.value)} placeholder={TEMPLATE} /></Field>
      {rows.length > 0 && (
        <div className="table-wrap import-preview"><table className="table"><thead><tr><th>Code</th><th>Name</th><th>Year</th><th>CLOs</th><th>PLOs</th><th>Skills</th></tr></thead>
          <tbody>{rows.slice(0, 50).map((r, i) => <tr key={i}><td className="mono">{r.code}</td><td>{r.name}</td><td>{r.year}</td><td>{r.clos.filter(Boolean).length}</td><td>{r.plo_codes.filter(Boolean).join(' ')}</td><td>{r.skills.filter(Boolean).length}</td></tr>)}</tbody></table></div>
      )}
      <label className="row small"><input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)} /> Remove subjects that are not in this file</label>
      <Notice>{err}</Notice><Notice tone="ok">{done}</Notice>
      <button className="btn btn--primary" disabled={!rows.length || busy} onClick={go}>{busy ? 'Importing…' : `Import ${rows.length} subject${rows.length === 1 ? '' : 's'}`}</button>
    </Modal>
  );
}

function Plos({ id, plos, subjects, reload }: { id: number; plos: Plo[]; subjects: Subject[]; reload: () => void }) {
  const [editing, setEditing] = useState<Plo | 'new' | null>(null);
  const [f, setF] = useState({ code: '', domain: '', description: '' });
  const [err, setErr] = useState('');
  const open = (p: Plo | 'new') => { setEditing(p); setErr(''); setF(p === 'new' ? { code: `PLO${plos.length + 1}`, domain: '', description: '' } : { code: p.code, domain: p.domain ?? '', description: p.description }); };
  const save = async () => {
    try { await api(editing === 'new' ? `/org/programmes/${id}/plos` : `/org/plos/${(editing as Plo).id}`, { method: editing === 'new' ? 'POST' : 'PUT', body: f }); setEditing(null); reload(); }
    catch (e) { setErr((e as Error).message); }
  };
  const remove = async (p: Plo) => { if (!confirm(`Delete ${p.code}?`)) return; await api(`/org/plos/${p.id}`, { method: 'DELETE' }); reload(); };
  return (
    <div className="stack">
      <div className="row between"><p className="muted small">The programme learning outcomes students are measured against. Codes are what subjects map to.</p><button className="btn btn--primary btn--sm" onClick={() => open('new')}><Plus size={14} /> PLO</button></div>
      <div className="plo-table">
        {plos.map(p => {
          const n = subjects.filter(s => s.plo_codes.includes(p.code)).length;
          return (
            <div key={p.id} className="plo-row">
              <span className="mono">{p.code}</span>
              <div><b>{p.domain || '—'}</b><p>{p.description}</p></div>
              <span className={`plo-row__n ${n ? '' : 'none'}`}>{n} subject{n === 1 ? '' : 's'}</span>
              <div className="row"><button className="icon-btn" onClick={() => open(p)} aria-label={`Edit ${p.code}`}><Pencil size={15} /></button><button className="icon-btn" onClick={() => remove(p)} aria-label={`Delete ${p.code}`}><Trash2 size={15} /></button></div>
            </div>
          );
        })}
      </div>
      {editing && (
        <Modal title={editing === 'new' ? 'Add PLO' : `Edit ${(editing as Plo).code}`} onClose={() => setEditing(null)}>
          <div className="form-grid"><Field label="Code"><input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} /></Field><Field label="MQA domain"><input value={f.domain} onChange={e => setF({ ...f, domain: e.target.value })} placeholder="Knowledge, Cognitive, Digital…" /></Field></div>
          <Field label="Description"><textarea rows={3} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
          <Notice>{err}</Notice>
          <button className="btn btn--primary" onClick={save}>Save</button>
        </Modal>
      )}
    </div>
  );
}

// ── Shared panels ──────────────────────────────────────────────────────────
interface InsightData { students: number; avgReadiness: number | null; sharing: number; withResume: number; withInterview: number; plos: { code: string; domain: string; avg: number }[]; gaps: { code: string; domain: string; avg: number }[]; topSkills: { name: string; n: number }[]; byProgramme: { id: number; name: string; students: number; avgReadiness: number }[] }

function Insights({ scope }: { scope: Scope }) {
  const d = useApi<InsightData>(`/org/insights?${qs(scope)}`);
  if (d.loading && !d.data) return <Spinner label="Crunching student data" />;
  if (d.error || !d.data) return <Notice>{d.error}</Notice>;
  const x = d.data;
  if (!x.students) return <Empty icon={<Users />} title="No students yet"><p>Insights appear as soon as students pick this {scope.programme_id ? 'degree' : 'faculty or university'} in PathForward.</p></Empty>;
  const pct = (n: number) => `${Math.round((n / x.students) * 100)}%`;
  return (
    <div className="stack">
      <div className="stat-row">
        <div className="stat stat--c1"><span>Students</span><b>{x.students}</b></div>
        <div className="stat stat--c2"><span>Avg readiness</span><b>{x.avgReadiness}</b></div>
        <div className="stat stat--c3"><span>Built a resume</span><b>{pct(x.withResume)}</b></div>
        <div className="stat stat--c5"><span>Visible to recruiters</span><b>{pct(x.sharing)}</b></div>
      </div>
      <div className="grid-2">
        <Card eyebrow="Average across students" title="Programme outcome attainment">
          <ul className="plo-mini">{x.plos.map(p => <li key={p.code}><span className="mono">{p.code}</span><span className="plo-mini__d">{p.domain}</span><Meter value={p.avg} label={p.code} /></li>)}</ul>
          {x.gaps.length > 0 && <p className="small muted">Weakest: {x.gaps.map(g => `${g.code} ${g.domain} (${g.avg}%)`).join(', ')}. Consider mapping more subjects or adding co-curricular evidence.</p>}
        </Card>
        <div className="stack">
          <Card eyebrow="What your students can prove" title="Most common skills"><div className="chips">{x.topSkills.map(s => <Tag key={s.name}>{s.name} · {s.n}</Tag>)}</div></Card>
          {x.byProgramme.length > 1 && <Card eyebrow="By degree" title="Readiness">
            <ul className="list">{x.byProgramme.map(p => <li key={p.id}><Link to={`/app/manage/p/${p.id}`}>{p.name}</Link><span className="nowrap"><b>{p.avgReadiness}</b> <span className="muted small">· {p.students}</span></span></li>)}</ul>
          </Card>}
          <Card eyebrow="Practice" title={`${pct(x.withInterview)} have done a mock interview`}><Meter value={Math.round((x.withInterview / x.students) * 100)} /></Card>
        </div>
      </div>
    </div>
  );
}

interface StaffRow { id: number; role: string; label: string; name: string; email: string; pending: number; faculty: string | null; programme: string | null; user_id: string }

function Staff({ scope, programmes }: { scope: Scope; programmes?: Prog[] }) {
  const d = useApi<{ staff: StaffRow[]; can_grant: string[]; my: string }>(`/org/staff?${qs(scope)}`);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', role: '', programme_id: '' });
  const [err, setErr] = useState('');
  const [res, setRes] = useState<{ email: string; password: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const canCoordinator = !!programmes && d.data?.my && RANK[d.data.my] >= RANK.faculty_admin;
  const roles = useMemo(() => [...(d.data?.can_grant ?? []), ...(canCoordinator ? ['coordinator'] : [])], [d.data, canCoordinator]);
  const invite = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    const role = f.role || roles[0];
    const target = role === 'coordinator' && !scope.programme_id ? { programme_id: Number(f.programme_id) } : scope;
    try { setRes(await api('/org/staff', { body: { name: f.name, email: f.email, role, ...target } })); d.reload(); }
    catch (x) { setErr((x as Error).message); }
  };
  const remove = async (s: StaffRow) => { if (!confirm(`Remove ${s.name} as ${s.label}?`)) return; try { await api(`/org/staff/${s.id}`, { method: 'DELETE' }); d.reload(); } catch (x) { alert((x as Error).message); } };
  const msg = res?.password ? `You have been added to PathForward as university staff.\n\nSign in: ${location.origin}/login\nEmail: ${res.email}\nTemporary password: ${res.password}\n\nYou will choose your own password after signing in.` : '';
  const label: Record<string, string> = { uni_admin: 'University admin', faculty_admin: 'Faculty admin', coordinator: 'Programme coordinator' };
  if (!d.data) return <Spinner />;
  return (
    <div className="stack">
      <div className="row between"><p className="muted small">Each person sees and edits only their part: university admins run faculties, faculty admins run degrees, coordinators run a degree's subjects and outcomes.</p>{roles.length > 0 && <button className="btn btn--primary btn--sm" onClick={() => { setOpen(true); setRes(null); setF({ name: '', email: '', role: roles[0], programme_id: String(programmes?.[0]?.id ?? '') }); }}><Plus size={14} /> Add staff</button>}</div>
      {!d.data.staff.length ? <Empty icon={<Users />} title="No staff here yet" /> : (
        <ul className="staff">{d.data.staff.map(s => (
          <li key={s.id}>
            <span className="avatar">{s.name.slice(0, 1)}</span>
            <div><b>{s.name}</b><span>{s.email}</span></div>
            <div className="staff__role"><Tag tone={s.role === 'coordinator' ? 'info' : s.role === 'faculty_admin' ? 'ok' : 'accent'}>{s.label}</Tag><span className="muted small">{s.programme ?? s.faculty ?? ''}</span></div>
            {s.pending ? <Tag tone="warn">Invited</Tag> : null}
            <button className="icon-btn" onClick={() => remove(s)} aria-label={`Remove ${s.name}`}><Trash2 size={15} /></button>
          </li>
        ))}</ul>
      )}
      {open && (
        <Modal title={res ? 'Staff added' : 'Add staff'} onClose={() => setOpen(false)}>
          {!res ? (
            <form className="stack" onSubmit={invite}>
              <Field label="Role"><select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{roles.map(r => <option key={r} value={r}>{label[r]}</option>)}</select></Field>
              {(f.role || roles[0]) === 'coordinator' && !scope.programme_id && programmes && <Field label="Degree"><select value={f.programme_id} onChange={e => setF({ ...f, programme_id: e.target.value })}>{programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
              <Field label="Full name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></Field>
              <Field label="University email"><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required /></Field>
              <Notice>{err}</Notice>
              <button className="btn btn--primary">Add</button>
            </form>
          ) : res.password ? (
            <div className="stack">
              <Notice tone="ok">Account created. Send these details; the password is shown only once.</Notice>
              <pre className="invite">{msg}</pre>
              <div className="row"><button className="btn btn--primary" onClick={() => { navigator.clipboard.writeText(msg); setCopied(true); }}><Copy size={15} /> {copied ? 'Copied' : 'Copy'}</button><a className="btn btn--ghost" href={`mailto:${res.email}?subject=${encodeURIComponent('Your PathForward staff account')}&body=${encodeURIComponent(msg)}`}>Open in email</a></div>
            </div>
          ) : <p><b>{res.email}</b> already has an account and now has this role. They will see it next time they sign in.</p>}
        </Modal>
      )}
    </div>
  );
}

function Log({ scope }: { scope: Scope }) {
  const d = useApi<{ action: string; detail: string | null; created_at: string; name: string | null }[]>(`/org/log?${qs(scope)}`);
  if (!d.data) return <Spinner />;
  if (!d.data.length) return <Empty icon={<History />} title="No changes yet"><p>Every curriculum and staff change is recorded here for accreditation audits.</p></Empty>;
  return <ul className="timeline">{d.data.map((l, i) => <li key={i}><span className="mono muted">{l.created_at.slice(0, 16).replace('T', ' ')}</span><span><b>{l.name ?? 'Someone'}</b> {l.action.replace('.', ' ')}{l.detail ? `: ${l.detail}` : ''}</span></li>)}</ul>;
}

// ── Create / edit university, faculty, degree ──────────────────────────────
function EntityModal({ kind, parent, item, siblings, onClose, onSaved }: { kind: 'institution' | 'faculty' | 'programme'; parent?: number; item?: any; siblings?: Prog[]; onClose: () => void; onSaved: (id?: number) => void }) {
  const [f, setF] = useState<Record<string, string | number | boolean>>(() => ({ name: item?.name ?? '', short_name: item?.short_name ?? '', city: item?.city ?? '', email_domain: item?.email_domain ?? '', level: item?.level ?? 'Bachelor', mqa_code: item?.mqa_code ?? '', duration_years: item?.duration_years ?? 4, code: item?.code ?? '', active: item ? !!item.active : true, copy_plos_from: '' }));
  const [err, setErr] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const path = kind === 'institution' ? 'institutions' : kind === 'faculty' ? 'faculties' : 'programmes';
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    const body = { ...f, ...(kind === 'faculty' && !item ? { institution_id: parent } : {}), ...(kind === 'programme' && !item ? { faculty_id: parent } : {}) };
    try { const r = await api<{ id?: number }>(item ? `/org/${path}/${item.id}` : `/org/${path}`, { method: item ? 'PUT' : 'POST', body }); onSaved(r.id); onClose(); }
    catch (x) { setErr((x as Error).message); }
  };
  const title = `${item ? 'Edit' : 'Add'} ${kind === 'institution' ? 'university' : kind === 'faculty' ? 'faculty' : 'degree'}`;
  return (
    <Modal title={title} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <Field label="Full name"><input value={String(f.name)} onChange={set('name')} required placeholder={kind === 'programme' ? 'Bachelor of Computer Science (…) with Honours' : ''} /></Field>
        {kind !== 'programme' && <Field label="Short name"><input value={String(f.short_name)} onChange={set('short_name')} placeholder={kind === 'institution' ? 'UTeM' : 'FTMK'} /></Field>}
        {kind === 'institution' && <div className="form-grid"><Field label="City"><input value={String(f.city)} onChange={set('city')} /></Field><Field label="Student email domain" hint="Used to suggest the university at sign-up"><input value={String(f.email_domain)} onChange={set('email_domain')} placeholder="utem.edu.my" /></Field></div>}
        {kind === 'programme' && <div className="form-grid">
          <Field label="Level"><select value={String(f.level)} onChange={set('level')}>{['Diploma', 'Bachelor', 'Master', 'PhD', 'Foundation'].map(l => <option key={l}>{l}</option>)}</select></Field>
          <Field label="Duration (years)"><input type="number" min={1} max={8} value={Number(f.duration_years)} onChange={set('duration_years')} /></Field>
          <Field label="MQA / MBOT reference"><input value={String(f.mqa_code)} onChange={set('mqa_code')} placeholder="MQA/FA 1887" /></Field>
          <Field label="Internal code"><input value={String(f.code)} onChange={set('code')} placeholder="BITS" /></Field>
        </div>}
        {kind === 'programme' && !item && siblings && siblings.length > 0 && <Field label="Start PLOs from" hint="Copies the outcomes so the coordinator edits rather than retypes them"><select value={String(f.copy_plos_from)} onChange={set('copy_plos_from')}><option value="">Standard 11 MQA outcomes</option>{siblings.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {item && <label className="row small"><input type="checkbox" checked={!!f.active} onChange={e => setF({ ...f, active: e.target.checked })} /> Visible to students</label>}
        <Notice>{err}</Notice>
        <button className="btn btn--primary">{item ? 'Save' : 'Create'}</button>
      </form>
    </Modal>
  );
}
