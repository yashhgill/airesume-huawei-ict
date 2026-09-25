import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookmarkPlus, BriefcaseBusiness, ExternalLink, Search, Sparkles, Wand2 } from 'lucide-react';
import { api } from '../lib/api';
import type { Job } from '../lib/types';
import { Card, Empty, Meter, Notice, PageHead, Spinner, Tag } from '../components/ui';
import { GenerateModal } from './Resumes';

interface SearchRes { jobs: Job[]; sources: { name: string; ok: boolean; count: number }[]; skills: number; localSource?: boolean }
interface Fit { score: number; summary: string; matched: string[]; missing: string[]; advice: string[] }

export function JobsPage() {
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [loc, setLoc] = useState(sp.get('location') ?? 'Malaysia');
  const [res, setRes] = useState<SearchRes | null>(null);
  const [sel, setSel] = useState<Job | null>(null);
  const [fit, setFit] = useState<Fit | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [tailor, setTailor] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const search = async (query = q) => {
    if (!query.trim()) return;
    setBusy('search'); setErr(''); setSel(null); setFit(null);
    setSp({ q: query, location: loc });
    try { const r = await api<SearchRes>(`/jobs/search?q=${encodeURIComponent(query)}&location=${encodeURIComponent(loc)}`); setRes(r); setSel(r.jobs[0] ?? null); }
    catch (x) { setErr((x as Error).message); } finally { setBusy(''); }
  };
  useEffect(() => { if (sp.get('q')) search(sp.get('q')!); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { setFit(null); }, [sel]);

  const deepFit = async () => { if (!sel) return; setBusy('fit'); setErr(''); try { setFit(await api<Fit>('/jobs/fit', { body: sel })); } catch (x) { setErr((x as Error).message); } finally { setBusy(''); } };
  const save = async () => { if (!sel) return; await api('/jobs/saved', { body: { job: sel, match_score: fit?.score ?? sel.fit.score } }); setSaved(new Set(saved).add(sel.id)); };
  const ext = (site: string) => {
    const t = encodeURIComponent(q || 'graduate');
    return site === 'jobstreet' ? `https://my.jobstreet.com/${(q || 'graduate').trim().replace(/\s+/g, '-')}-jobs` : site === 'linkedin' ? `https://www.linkedin.com/jobs/search/?keywords=${t}&location=Malaysia` : `https://hiredly.com/jobs?search=${t}`;
  };

  return (
    <div className="page">
      <PageHead eyebrow="Job search" title="Jobs that fit what you can prove" sub="Live openings from public job boards, ranked by how many of the job's skills you already have." />
      <form className="searchbar" onSubmit={e => { e.preventDefault(); search(); }}>
        <Search size={18} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Role or skill, e.g. cloud engineer" aria-label="Role or skill" />
        <input value={loc} onChange={e => setLoc(e.target.value)} placeholder="Location" aria-label="Location" className="searchbar__loc" />
        <button className="btn btn--primary" disabled={busy === 'search'}>{busy === 'search' ? 'Searching…' : 'Search'}</button>
      </form>
      <div className="row small muted">
        Also search on:
        <a href={ext('jobstreet')} target="_blank" rel="noreferrer">JobStreet</a>·
        <a href={ext('linkedin')} target="_blank" rel="noreferrer">LinkedIn</a>·
        <a href={ext('hiredly')} target="_blank" rel="noreferrer">Hiredly</a>
        {res && <span>· Sources: {res.sources.map(s => `${s.name} ${s.ok ? s.count : '✕'}`).join(', ')}</span>}
      </div>
      <Notice>{err}</Notice>
      {res && !res.localSource && <Notice tone="info">Showing remote roles open to candidates in Malaysia. Local Malaysian listings need the JSearch source; until it is enabled, use the JobStreet, LinkedIn and Hiredly links above.</Notice>}
      {res && res.skills === 0 && <Notice tone="info">Add skills to your profile to get match scores. <Link to="/app/profile?tab=skills">Add skills</Link></Notice>}

      {busy === 'search' && <Spinner label="Searching job boards" />}
      {!res && busy !== 'search' && <Empty icon={<BriefcaseBusiness />} title="Search for a role"><p>Try “cloud engineer”, “data analyst” or “software developer”.</p></Empty>}
      {res && res.jobs.length === 0 && <Empty icon={<BriefcaseBusiness />} title="No openings found"><p>Try a broader title, or use the JobStreet and LinkedIn links above.</p></Empty>}

      {res && res.jobs.length > 0 && (
        <div className="jobs">
          <ul className="jobs__list">
            {res.jobs.map(j => (
              <li key={j.id}>
                <button className={`job ${sel?.id === j.id ? 'is-on' : ''}`} onClick={() => setSel(j)}>
                  <div className="row between"><b>{j.title}</b><span className="mono">{j.fit.score}%</span></div>
                  <span className="muted small">{j.company} · {j.location}{j.remote ? ' · Remote' : ''}</span>
                  <Meter value={j.fit.score} />
                </button>
              </li>
            ))}
          </ul>
          {sel && (
            <Card className="job-detail">
              <div className="row between">
                <div><h2>{sel.title}</h2><p className="muted">{sel.company} · {sel.location} · via {sel.source}{sel.posted ? ` · ${sel.posted.slice(0, 10)}` : ''}</p>{sel.salary && <p className="small"><b>{sel.salary}</b></p>}</div>
                <a className="btn btn--ghost btn--sm" href={sel.url} target="_blank" rel="noreferrer">Open listing <ExternalLink size={14} /></a>
              </div>
              <div className="row">
                <button className="btn btn--primary" onClick={() => setTailor(true)}><Wand2 size={16} /> Tailor my resume</button>
                <button className="btn btn--ghost" onClick={deepFit} disabled={busy === 'fit'}><Sparkles size={16} /> {busy === 'fit' ? 'Analysing…' : 'Deep AI fit'}</button>
                <button className="btn btn--ghost" onClick={save} disabled={saved.has(sel.id)}><BookmarkPlus size={16} /> {saved.has(sel.id) ? 'Saved to tracker' : 'Save'}</button>
              </div>
              <div className="chips">{sel.fit.matched.map(m => <Tag key={m} tone="ok">✓ {m}</Tag>)}{sel.fit.missing.map(m => <Tag key={m} tone="warn">{m}</Tag>)}</div>
              {fit && (
                <div className="fitbox">
                  <div className="row between"><b>AI fit {fit.score}%</b></div>
                  <p>{fit.summary}</p>
                  {fit.missing.length > 0 && <p className="small"><span className="muted">Not evidenced yet:</span> {fit.missing.join('; ')}</p>}
                  <ul className="bullets">{fit.advice.map(a => <li key={a}>{a}</li>)}</ul>
                </div>
              )}
              <div className="job-desc">{sel.description}</div>
            </Card>
          )}
        </div>
      )}
      {tailor && sel && <GenerateModal job={{ title: sel.title, company: sel.company, location: sel.location, description: sel.description, url: sel.url }} onClose={() => setTailor(false)} />}
    </div>
  );
}
