import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '../lib/api';
import type { ResumeContent } from '../lib/types';
import { ResumeView } from '../components/ResumeView';

interface Doc { id: string; title: string; template: string; content: ResumeContent }

/** A clean page with only the resume on it, so print / Save as PDF works on every device. */
export function PrintResume() {
  const { id } = useParams();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const html = document.documentElement, prev = html.getAttribute('data-theme');
    html.setAttribute('data-theme', 'light'); html.classList.add('print-page');
    return () => { prev ? html.setAttribute('data-theme', prev) : html.removeAttribute('data-theme'); html.classList.remove('print-page'); };
  }, []);
  useEffect(() => { api<Doc>(`/resumes/${id}`).then(setDoc).catch(e => setErr(e.message)); }, [id]);
  useEffect(() => {
    if (!doc) return;
    document.title = doc.title || 'Resume';
    // Desktop: open the print dialog straight away once fonts are ready. Phones: wait for the tap.
    if (!/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) document.fonts.ready.then(() => setTimeout(() => window.print(), 300));
  }, [doc]);
  return (
    <div className="printpg">
      <div className="printpg__bar no-print">
        <Link className="btn btn--ghost btn--sm" to={`/app/resumes/${id}`}><ArrowLeft size={16} /> Back to editor</Link>
        <button className="btn btn--primary btn--sm" onClick={() => window.print()} disabled={!doc}><Printer size={16} /> Save as PDF / Print</button>
      </div>
      <p className="printpg__tip no-print muted small">In the print window choose <b>Save as PDF</b> (on iPhone: tap Print, then the share icon → Save to Files).</p>
      {err && <p className="no-print">{err}</p>}
      {doc && <div className="printpg__paper"><ResumeView r={doc.content} template={doc.template} /></div>}
    </div>
  );
}
