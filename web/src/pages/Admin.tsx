import { useEffect, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { Card, Field, Modal, Notice, PageHead, Spinner, Tag } from '../components/ui';

interface Stats { users: number; resumes: number; saved: number; aiCalls: number; aiFails: number; avgMs: number | null; avgAts: number | null; daily: { day: string; n: number }[]; byAction: { action: string; n: number; fails: number; ms: number | null }[]; topSkills: { name: string; n: number }[] }

export function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('stats');
  if (user?.role !== 'admin') return <div className="page"><Notice>Admins only.</Notice></div>;
  return (
    <div className="page">
      <PageHead eyebrow="Admin" title="Platform console" sub="Usage, AI health, users and the curriculum that powers competency mapping." />
      <div className="tabs" role="tablist">{[['stats', 'Overview'], ['curriculum', 'Curriculum'], ['users', 'Users'], ['activity', 'Activity log']].map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>{l}</button>)}</div>
      {tab === 'stats' && <StatsTab />}
      {tab === 'curriculum' && <Curriculum />}
      {tab === 'users' && <Users />}
      {tab === 'activity' && <Activity />}
    </div>
  );
}

function StatsTab() {
  const { data: s } = useApi<Stats>('/admin/stats');
  const health = useApi<{ runtime: string; ai: string; jobs: string[] }>('/health');
  if (!s) return <Spinner />;
  const max = Math.max(1, ...s.daily.map(d => d.n));
  return (
    <div className="stack">
      <div className="kpis kpis--5">
        {[['Users', s.users], ['Resumes', s.resumes], ['Saved jobs', s.saved], ['AI calls', s.aiCalls], ['Avg AI latency', s.avgMs ? `${(s.avgMs / 1000).toFixed(1)} s` : '–']].map(([l, v]) => <div key={l} className="kpi"><span>{l}</span><b>{v}</b></div>)}
      </div>
      <div className="grid-2">
        <Card eyebrow="Last 14 days" title="Activity">
          {s.daily.length === 0 ? <p className="muted">No activity yet.</p> : (
            <div className="spark-bars" role="img" aria-label="Events per day">
              {s.daily.map(d => <div key={d.day} title={`${d.day}: ${d.n}`}><i style={{ height: `${(d.n / max) * 100}%` }} /><span>{d.day.slice(8)}</span></div>)}
            </div>
          )}
          <p className="muted small">Runtime <b>{health.data?.runtime}</b> · AI <b>{health.data?.ai}</b> · Job sources {health.data?.jobs.join(', ')} · AI failure rate {s.aiCalls ? Math.round((s.aiFails / s.aiCalls) * 100) : 0}% · Avg ATS {s.avgAts ?? '–'}</p>
        </Card>
        <Card eyebrow="Endpoints" title="Calls by action">
          <table className="table"><thead><tr><th>Action</th><th>Calls</th><th>Failed</th><th>Avg ms</th></tr></thead>
            <tbody>{s.byAction.map(a => <tr key={a.action}><td className="mono">{a.action}</td><td>{a.n}</td><td>{a.fails || ''}</td><td>{a.ms ?? ''}</td></tr>)}</tbody></table>
        </Card>
      </div>
      <Card eyebrow="Across all students" title="Most common skills"><div className="chips">{s.topSkills.map(k => <Tag key={k.name}>{k.name} · {k.n}</Tag>)}</div></Card>
    </div>
  );
}

interface Subj { id: number; code: string | null; name: string; year: number | null; clos: string[]; plo_codes: string[]; skills: string[] }

function Curriculum() {
  const cat = useApi<{ programmes: { id: number; name: string; subjects: number }[] }>('/catalog');
  const [pid, setPid] = useState<number | null>(null);
  const [detail, setDetail] = useState<{ plos: { code: string; domain: string }[]; subjects: Subj[] } | null>(null);
  const [edit, setEdit] = useState<Partial<Subj> | null>(null);
  const load = async (id: number) => setDetail(await api(`/catalog/programmes/${id}`));
  useEffect(() => { if (!pid && cat.data?.programmes.length) setPid(cat.data.programmes[0].id); }, [cat.data, pid]);
  useEffect(() => { if (pid) load(pid); }, [pid]);

  return (
    <div className="stack">
      <div className="row">
        <select value={pid ?? ''} onChange={e => setPid(Number(e.target.value))} aria-label="Programme">{cat.data?.programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <button className="btn btn--primary" onClick={() => setEdit({ name: '', year: 1, clos: [], plo_codes: [], skills: [] })}><Plus size={16} /> Add subject</button>
      </div>
      {!detail ? <Spinner /> : (
        <Card>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Year</th><th>Subject</th><th>PLOs</th><th>Skills</th><th /></tr></thead>
              <tbody>{detail.subjects.map(s => (
                <tr key={s.id}>
                  <td>{s.year}</td><td><b>{s.name}</b><div className="muted small">{s.clos.join(' · ')}</div></td>
                  <td className="mono">{s.plo_codes.join(', ')}</td><td>{s.skills.join(', ')}</td>
                  <td className="nowrap"><button className="icon-btn" aria-label="Edit" onClick={() => setEdit(s)}><Pencil size={15} /></button><button className="icon-btn" aria-label="Delete" onClick={async () => { if (confirm(`Delete ${s.name}?`)) { await api(`/admin/subjects/${s.id}`, { method: 'DELETE' }); load(pid!); } }}><Trash2 size={15} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}
      {edit && pid && <SubjectForm s={edit} pid={pid} plos={detail?.plos ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(pid); }} />}
    </div>
  );
}

function SubjectForm({ s, pid, plos, onClose, onSaved }: { s: Partial<Subj>; pid: number; plos: { code: string; domain: string }[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: s.name ?? '', code: s.code ?? '', year: String(s.year ?? 1), clos: (s.clos ?? []).join('\n'), skills: (s.skills ?? []).join(', ') });
  const [codes, setCodes] = useState<string[]>(s.plo_codes ?? []);
  const [err, setErr] = useState('');
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    const body = { programme_id: pid, name: f.name, code: f.code, year: f.year, clos: f.clos, plo_codes: codes, skills: f.skills };
    try { s.id ? await api(`/admin/subjects/${s.id}`, { method: 'PUT', body }) : await api('/admin/subjects', { body }); onSaved(); } catch (x) { setErr((x as Error).message); }
  };
  return (
    <Modal title={s.id ? 'Edit subject' : 'Add subject'} onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        <div className="grid-3"><Field label="Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required /></Field><Field label="Code"><input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} /></Field><Field label="Year"><input value={f.year} onChange={e => setF({ ...f, year: e.target.value })} inputMode="numeric" /></Field></div>
        <Field label="Course learning outcomes" hint="One per line."><textarea rows={4} value={f.clos} onChange={e => setF({ ...f, clos: e.target.value })} /></Field>
        <div className="field"><span className="field__label">Supports PLOs</span><div className="chips">{plos.map(p => <button type="button" key={p.code} className={`chip ${codes.includes(p.code) ? 'chip--on' : ''}`} onClick={() => setCodes(codes.includes(p.code) ? codes.filter(c => c !== p.code) : [...codes, p.code])} aria-pressed={codes.includes(p.code)}>{p.code} {p.domain}</button>)}</div></div>
        <Field label="Skills this subject builds" hint="Comma separated. Students get these automatically."><input value={f.skills} onChange={e => setF({ ...f, skills: e.target.value })} /></Field>
        <Notice>{err}</Notice>
        <button className="btn btn--primary">Save subject</button>
      </form>
    </Modal>
  );
}

function Users() {
  const list = useApi<{ id: string; name: string; email: string; role: string; created_at: string; resumes: number; skills: number }[]>('/admin/users');
  if (!list.data) return <Spinner />;
  return (
    <Card>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Skills</th><th>Resumes</th><th>Role</th></tr></thead>
        <tbody>{list.data.map(u => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.created_at.slice(0, 10)}</td><td>{u.skills}</td><td>{u.resumes}</td>
          <td><select value={u.role} aria-label={`Role for ${u.email}`} onChange={async e => { await api(`/admin/users/${u.id}/role`, { method: 'PUT', body: { role: e.target.value } }); list.reload(); }}><option value="student">student</option><option value="admin">admin</option></select></td></tr>)}</tbody>
      </table></div>
    </Card>
  );
}

function Activity() {
  const list = useApi<{ id: number; action: string; detail: string | null; ok: number; ms: number | null; created_at: string; email: string | null }[]>('/admin/activity');
  if (!list.data) return <Spinner />;
  return (
    <Card>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Time (UTC)</th><th>User</th><th>Action</th><th>Detail</th><th>ms</th></tr></thead>
        <tbody>{list.data.map(a => <tr key={a.id} className={a.ok ? '' : 'row-bad'}><td className="mono nowrap">{a.created_at.slice(5, 16)}</td><td>{a.email ?? '–'}</td><td className="mono">{a.action}</td><td>{a.detail}</td><td>{a.ms ?? ''}</td></tr>)}</tbody>
      </table></div>
    </Card>
  );
}
