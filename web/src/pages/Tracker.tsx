import { Link } from 'react-router-dom';
import { ExternalLink, Kanban, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Empty, PageHead, Spinner } from '../components/ui';

interface Saved { id: string; status: string; match_score: number | null; notes: string | null; created_at: string; job: { title: string; company: string; location: string; url: string; source: string } }
const COLS = [
  { id: 'saved', label: 'Saved' }, { id: 'applied', label: 'Applied' }, { id: 'interview', label: 'Interview' }, { id: 'offer', label: 'Offer' }, { id: 'rejected', label: 'Closed' },
];

export function TrackerPage() {
  const list = useApi<Saved[]>('/jobs/saved');
  const move = async (s: Saved, status: string) => { list.setData(list.data!.map(x => x.id === s.id ? { ...x, status } : x)); await api(`/jobs/saved/${s.id}`, { method: 'PUT', body: { status } }); };
  const note = async (s: Saved, notes: string) => { await api(`/jobs/saved/${s.id}`, { method: 'PUT', body: { notes } }); };

  if (list.loading) return <div className="page"><Spinner /></div>;
  return (
    <div className="page">
      <PageHead eyebrow="Applications" title="Track every application" sub="Save jobs from search, then move them along as you hear back." />
      {!list.data?.length ? <Empty icon={<Kanban />} title="Nothing saved yet"><Link className="btn btn--primary" to="/app/jobs">Search jobs</Link></Empty> : (
        <div className="board">
          {COLS.map(col => {
            const items = list.data!.filter(s => s.status === col.id);
            return (
              <section key={col.id} className={`board__col board__col--${col.id}`}>
                <h2>{col.label} <span>{items.length}</span></h2>
                {items.map(s => (
                  <article key={s.id} className="ticket">
                    <b>{s.job.title}</b>
                    <span className="muted small">{s.job.company}{s.match_score != null ? ` · ${s.match_score}% fit` : ''}</span>
                    <textarea aria-label="Notes" rows={2} placeholder="Notes: contact, deadline…" defaultValue={s.notes ?? ''} onBlur={e => note(s, e.target.value)} />
                    <div className="row between">
                      <select aria-label="Stage" value={s.status} onChange={e => move(s, e.target.value)}>{COLS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
                      <span className="row">
                        {s.job.url && <a className="icon-btn" href={s.job.url} target="_blank" rel="noreferrer" aria-label="Open listing"><ExternalLink size={15} /></a>}
                        <button className="icon-btn" aria-label="Remove" onClick={async () => { await api(`/jobs/saved/${s.id}`, { method: 'DELETE' }); list.reload(); }}><Trash2 size={15} /></button>
                      </span>
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
