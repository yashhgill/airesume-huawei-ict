import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FilePlus2, FileText, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Card, Empty, Field, Modal, Notice, PageHead, Spinner, Tag } from '../components/ui';

interface Row { id: string; title: string; target_role: string; template: string; ats_score: number | null; job_ref: { title: string; company: string } | null; updated_at: string }

export function ResumesPage() {
  const list = useApi<Row[]>('/resumes');
  const [sp, setSp] = useSearchParams();
  const [open, setOpen] = useState(sp.get('new') === '1');
  useEffect(() => { if (sp.get('new') === '1') setOpen(true); }, [sp]);

  return (
    <div className="page">
      <PageHead eyebrow="Resumes" title="Your resumes" sub="Generate one per role you apply for. Edit anything, then export a PDF."
        actions={<button className="btn btn--primary" onClick={() => setOpen(true)}><FilePlus2 size={16} /> New resume</button>} />
      {list.loading ? <Spinner /> : !list.data?.length ? (
        <Empty icon={<FileText />} title="No resumes yet"><p>Tell us the role you want and the AI writes a one-page resume from your profile.</p><button className="btn btn--primary" onClick={() => setOpen(true)}>Generate my first resume</button></Empty>
      ) : (
        <div className="cards">
          {list.data.map(r => (
            <Card key={r.id} className="resume-card">
              <Link to={`/app/resumes/${r.id}`} className="resume-card__thumb" aria-label={`Open ${r.title}`}><span /><span /><span /><span /></Link>
              <div className="row between">
                <div><Link to={`/app/resumes/${r.id}`}><b>{r.title}</b></Link><p className="muted small">{r.target_role} · {r.template} · {r.updated_at.slice(0, 10)}</p></div>
                <button className="icon-btn" aria-label="Delete resume" onClick={async () => { if (confirm('Delete this resume?')) { await api(`/resumes/${r.id}`, { method: 'DELETE' }); list.reload(); } }}><Trash2 size={16} /></button>
              </div>
              <div className="row">{r.ats_score != null && <Tag tone={r.ats_score >= 70 ? 'ok' : 'warn'}>ATS {r.ats_score}</Tag>}{r.job_ref && <Tag tone="info">Tailored: {r.job_ref.company || r.job_ref.title}</Tag>}</div>
            </Card>
          ))}
        </div>
      )}
      {open && <GenerateModal initialRole={sp.get('role') ?? ''} onClose={() => { setOpen(false); setSp({}); }} />}
    </div>
  );
}

export function GenerateModal({ initialRole = '', job, onClose }: { initialRole?: string; job?: { title: string; company: string; location?: string; description: string; url?: string }; onClose: () => void }) {
  const nav = useNavigate();
  const [role, setRole] = useState(initialRole || job?.title || '');
  const [tone, setTone] = useState('professional');
  const [template, setTemplate] = useState('modern');
  const [jd, setJd] = useState(job?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const body: Record<string, unknown> = { target_role: role, tone, template };
      if (jd.trim().length > 60) body.job = { title: job?.title ?? role, company: job?.company ?? '', location: job?.location ?? '', description: jd, url: job?.url };
      const r = await api<{ id: string }>('/resumes/generate', { body });
      nav(`/app/resumes/${r.id}`);
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  };
  return (
    <Modal title={job ? `Tailor a resume for ${job.company || job.title}` : 'Generate a resume'} onClose={onClose}>
      <form className="stack" onSubmit={go}>
        <Field label="Target role"><input value={role} onChange={e => setRole(e.target.value)} placeholder="Junior Cloud Engineer" required /></Field>
        <div className="grid-2">
          <Field label="Tone"><select value={tone} onChange={e => setTone(e.target.value)}><option value="professional">Professional</option><option value="confident">Confident</option><option value="concise">Concise</option><option value="friendly">Friendly</option></select></Field>
          <Field label="Template"><select value={template} onChange={e => setTemplate(e.target.value)}><option value="modern">Modern (two column)</option><option value="classic">Classic (serif)</option><option value="compact">Compact</option></select></Field>
        </div>
        <Field label="Job description (optional)" hint="Paste a job ad to tailor keywords. Only skills you actually have are used."><textarea rows={5} value={jd} onChange={e => setJd(e.target.value)} /></Field>
        <Notice>{err}</Notice>
        <button className="btn btn--primary btn--wide" disabled={busy}>{busy ? 'Writing your resume… (about 10 s)' : 'Generate resume'}</button>
      </form>
    </Modal>
  );
}
