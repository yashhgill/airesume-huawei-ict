import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Card, Field, Notice, PageHead, Spinner, Tag } from '../components/ui';

interface Catalog { institutions: { id: number; name: string; short_name: string }[]; faculties: { id: number; institution_id: number; name: string }[]; programmes: { id: number; faculty_id: number; name: string; subjects: number }[] }
interface ProgrammeDetail { programme: { id: number; name: string; institution: string }; plos: { code: string; domain: string }[]; subjects: { id: number; name: string; year: number; plo_codes: string[]; skills: string[] }[] }

export function Onboarding() {
  const nav = useNavigate();
  const cat = useApi<Catalog>('/catalog');
  const [step, setStep] = useState(1);
  const [programmeId, setProgrammeId] = useState<number | null>(null);
  const [years, setYears] = useState({ start: new Date().getFullYear() - 2, end: new Date().getFullYear() + 1 });
  const [cgpa, setCgpa] = useState('');
  const [detail, setDetail] = useState<ProgrammeDetail | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [added, setAdded] = useState<{ name: string; evidence: string[] }[]>([]);
  const [aiExtra, setAiExtra] = useState<{ name: string; category: string; level: number; evidence: string }[]>([]);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!programmeId) return;
    api<ProgrammeDetail>(`/catalog/programmes/${programmeId}`).then(setDetail).catch(e => setError(e.message));
  }, [programmeId]);

  const byYear = useMemo(() => {
    const m = new Map<number, ProgrammeDetail['subjects']>();
    detail?.subjects.forEach(s => m.set(s.year ?? 0, [...(m.get(s.year ?? 0) ?? []), s]));
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [detail]);

  const saveEducation = async () => {
    if (!programmeId) return setError('Choose your programme.');
    setBusy('Saving'); setError('');
    try {
      await api('/profile/education', { body: { programme_id: programmeId, start_year: years.start, end_year: years.end, cgpa: cgpa || null } });
      setStep(2);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  const saveSubjects = async () => {
    setBusy('Mapping'); setError('');
    try {
      await api('/profile/subjects', { method: 'PUT', body: { subject_ids: [...picked] } });
      const r = await api<{ skills: { name: string; evidence: string[] }[] }>('/profile/skills/from-subjects', { body: {} });
      setAdded(r.skills);
      setStep(3);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  const askAi = async () => {
    setBusy('AI'); setError('');
    try {
      const r = await api<{ suggestions: typeof aiExtra }>('/ai/skills', { body: {} });
      setAiExtra(r.suggestions);
      setAsked(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  const keepAi = async () => {
    setBusy('Saving');
    try { await api('/profile/skills', { body: { skills: aiExtra.map(s => ({ ...s, source: 'ai' })) } }); nav('/app'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  };

  const toggleYear = (list: ProgrammeDetail['subjects']) => {
    const all = list.every(s => picked.has(s.id));
    const next = new Set(picked);
    list.forEach(s => (all ? next.delete(s.id) : next.add(s.id)));
    setPicked(next);
  };

  return (
    <div className="page">
      <PageHead eyebrow={`Step ${step} of 3`} title={['Where do you study?', 'Which subjects have you completed?', 'Your skills, with evidence'][step - 1]}
        sub={['Your programme decides which learning outcomes we map you against.', 'Each subject carries learning outcomes that count as evidence for your programme outcomes.', 'These come straight from your curriculum. Let the AI add soft skills and tools too.'][step - 1]}
        actions={<Link className="btn btn--ghost" to="/app/profile?tab=import">Import my CV instead</Link>} />
      <ol className="steps">{['Programme', 'Subjects', 'Skills'].map((s, i) => <li key={s} className={i + 1 < step ? 'done' : i + 1 === step ? 'now' : ''}>{i + 1 < step ? <Check size={14} /> : i + 1}<span>{s}</span></li>)}</ol>
      <Notice>{error}</Notice>

      {step === 1 && (
        <Card>
          {cat.loading ? <Spinner label="Loading programmes" /> : (
            <div className="stack">
              {cat.data?.institutions.map(i => (
                <div key={i.id} className="stack">
                  <p className="eyebrow">{i.name}</p>
                  {cat.data!.faculties.filter(f => f.institution_id === i.id).map(f => (
                    <div key={f.id} className="stack-sm">
                      <p className="muted small">{f.name}</p>
                      <div className="choices">
                        {cat.data!.programmes.filter(p => p.faculty_id === f.id).map(p => (
                          <button key={p.id} type="button" className={`choice ${programmeId === p.id ? 'is-on' : ''}`} onClick={() => setProgrammeId(p.id)} aria-pressed={programmeId === p.id}>
                            <b>{p.name}</b><span>{p.subjects ? `${p.subjects} subjects mapped` : 'Learning outcomes only'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
              <div className="grid-3">
                <Field label="Start year"><input type="number" value={years.start} onChange={e => setYears({ ...years, start: Number(e.target.value) })} /></Field>
                <Field label="Expected graduation"><input type="number" value={years.end} onChange={e => setYears({ ...years, end: Number(e.target.value) })} /></Field>
                <Field label="CGPA (optional)"><input inputMode="decimal" placeholder="3.50" value={cgpa} onChange={e => setCgpa(e.target.value)} /></Field>
              </div>
              <div className="row end"><button className="btn btn--primary" onClick={saveEducation} disabled={!programmeId || !!busy}>{busy ? 'Saving…' : 'Continue'}</button></div>
            </div>
          )}
        </Card>
      )}

      {step === 2 && (
        <Card>
          {!detail ? <Spinner label="Loading subjects" /> : detail.subjects.length === 0 ? (
            <p className="muted">This programme has no subjects mapped yet. Continue and add skills manually, or ask an admin to add subjects.</p>
          ) : (
            <div className="stack">
              {byYear.map(([year, list]) => (
                <div key={year} className="stack-sm">
                  <div className="row between"><h3>Year {year}</h3><button className="btn btn--text" onClick={() => toggleYear(list)}>{list.every(s => picked.has(s.id)) ? 'Clear year' : 'Select all'}</button></div>
                  <div className="checks">
                    {list.map(s => (
                      <label key={s.id} className={`check ${picked.has(s.id) ? 'is-on' : ''}`}>
                        <input type="checkbox" checked={picked.has(s.id)} onChange={() => { const n = new Set(picked); n.has(s.id) ? n.delete(s.id) : n.add(s.id); setPicked(n); }} />
                        <span><b>{s.name}</b><small>{s.plo_codes.join(' · ')} — {s.skills.slice(0, 3).join(', ')}</small></span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="row between">
            <button className="btn btn--ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn--primary" onClick={saveSubjects} disabled={!!busy}>{busy ? 'Mapping…' : `Map ${picked.size} subjects`}</button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <div className="grid-2">
          <Card eyebrow="From your curriculum" title={`${added.length} skills added`}>
            {added.length === 0 ? <p className="muted">No new curriculum skills. You can add them on your profile.</p> : (
              <ul className="evidence">{added.map(s => <li key={s.name}><b>{s.name}</b><span>{s.evidence.join(', ')}</span></li>)}</ul>
            )}
          </Card>
          <Card eyebrow="AI suggestions" title="Soft skills and tools" actions={!aiExtra.length && !asked && <button className="btn btn--primary" onClick={askAi} disabled={!!busy}><Sparkles size={16} /> {busy === 'AI' ? 'Thinking…' : 'Suggest more'}</button>}>
            {busy === 'AI' && <Spinner label="Reading your learning outcomes" />}
            {aiExtra.length > 0 ? (
              <>
                <ul className="evidence">{aiExtra.map(s => <li key={s.name}><b>{s.name} <Tag>{s.category}</Tag></b><span>{s.evidence}</span></li>)}</ul>
                <button className="btn btn--primary" onClick={keepAi} disabled={!!busy}>Keep these and finish</button>
              </>
            ): asked ? <><p className="muted">No new suggestions: your curriculum skills already cover what the AI found.</p><Link className="btn btn--primary" to="/app">Finish</Link></> : <p className="muted">The AI reads each subject's learning outcomes and suggests skills you have evidence for, like teamwork from group projects.</p>}
          </Card>
          <div className="row end span-2"><Link className="btn btn--ghost" to="/app">Skip to dashboard</Link></div>
        </div>
      )}
    </div>
  );
}
