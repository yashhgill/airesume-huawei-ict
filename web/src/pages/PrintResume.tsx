import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { deliverPdf, resumePdf } from '../lib/resumePdf';
import { api } from '../lib/api';
import type { ResumeContent } from '../lib/types';
import { ResumeView } from '../components/ResumeView';

interface Doc { id: string; title: string; template: string; content: ResumeContent }

/** A clean page with only the resume on it, so print / Save as PDF works on every device. */
export function PrintResume() {
  const { id } = useParams();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (!doc) return; setBusy(true); setErr('');
    try { await deliverPdf(await resumePdf(doc.content), `${(doc.content.name || doc.title || 'Resume').replace(/[^\w\- ]+/g, '').trim()} - Resume.pdf`); }
    catch (e) { setErr((e as Error).message || 'Could not create the PDF.'); } finally { setBusy(false); }
  };
  useEffect(() => {
    const html = document.documentElement, prev = html.getAttribute('data-theme');
    html.setAttribute('data-theme', 'light'); html.classList.add('print-page');
    return () => { prev ? html.setAttribute('data-theme', prev) : html.removeAttribute('data-theme'); html.classList.remove('print-page'); };
  }, []);
  useEffect(() => { api<Doc>(`/resumes/${id}`).then(setDoc).catch(e => setErr(e.message)); }, [id]);
  useEffect(() => {
    if (!doc) return;
    document.title = doc.title || 'Resume';
  }, [doc]);
  return (
    <div className="printpg">
      <div className="printpg__bar no-print">
        <Link className="btn btn--ghost btn--sm" to={`/app/resumes/${id}`}><ArrowLeft size={16} /> Back to editor</Link>
        <button className="btn btn--primary btn--sm" onClick={download} disabled={!doc || busy}><Download size={16} /> {busy ? 'Creating PDF…' : 'Download PDF'}</button>
        <button className="btn btn--ghost btn--sm" onClick={() => window.print()} disabled={!doc}><Printer size={16} /> Print</button>
      </div>
      <p className="printpg__tip no-print muted small"><b>Download PDF</b> saves a text-based A4 file that recruiters' ATS can read. On iPhone, pick <b>Save to Files</b> from the share sheet.</p>
      {err && <p className="no-print">{err}</p>}
      {doc && <div className="printpg__paper"><ResumeView r={doc.content} template={doc.template} /></div>}
    </div>
  );
}
