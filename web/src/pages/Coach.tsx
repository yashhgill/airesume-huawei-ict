import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUp, RotateCcw, Sparkles, Square } from 'lucide-react';
import { api } from '../lib/api';
import { streamText } from '../lib/stream';
import { Md } from '../components/Md';
import { Notice, PageHead } from '../components/ui';

interface Msg { id: number | string; role: 'user' | 'coach'; content: string }

const STARTERS = [
  ['What should I focus on this week?', 'A short, prioritised list'],
  ['Which jobs fit me best right now?', 'Based on your subjects and skills'],
  ['How do I explain my final year project in an interview?', 'Turn it into a strong story'],
  ['Is HCIA worth it for me?', 'Certification advice for your path'],
];

export function CoachPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [live, setLive] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [sp, setSp] = useSearchParams();

  useEffect(() => { api<Msg[]>('/coach/history').then(m => { setMsgs(m); setLoaded(true); }).catch(() => setLoaded(true)); }, []);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [msgs, live]);
  useEffect(() => {
    const q = sp.get('q');
    if (q && loaded) { setSp({}, { replace: true }); send(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || live !== null) return;
    setErr(''); setText('');
    setMsgs(m => [...m, { id: `u${Date.now()}`, role: 'user', content: message }]);
    setLive('');
    abort.current = new AbortController();
    try {
      const full = await streamText('/coach/chat', { message }, setLive, abort.current.signal);
      setMsgs(m => [...m, { id: `c${Date.now()}`, role: 'coach', content: full }]);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setErr((e as Error).message);
    } finally { setLive(null); }
  };
  const stop = () => { abort.current?.abort(); if (live) setMsgs(m => [...m, { id: `c${Date.now()}`, role: 'coach', content: live }]); setLive(null); };
  const clear = async () => { if (!confirm('Clear your conversation with the coach?')) return; await api('/coach/history', { method: 'DELETE' }); setMsgs([]); };

  return (
    <div className="page coach">
      <PageHead eyebrow="Coach" title="Ask Path" sub="Your career coach. It has read your subjects, skills, projects and plan, so the advice is about you."
        actions={msgs.length > 0 && <button className="btn btn--ghost btn--sm" onClick={clear}><RotateCcw size={14} /> New conversation</button>} />

      <div className="coach__log" ref={log} aria-live="polite">
        {loaded && !msgs.length && live === null && (
          <div className="starters">
            {STARTERS.map(([q, s]) => <button key={q} className="starter" onClick={() => send(q)}><b>{q}</b><span>{s}</span></button>)}
          </div>
        )}
        {msgs.map(m => m.role === 'user'
          ? <div key={m.id} className="bubble bubble--user">{m.content}</div>
          : <div key={m.id} className="bubble bubble--coach"><div className="coach__who"><span className="coach__dot"><Sparkles size={12} /></span>Path</div><Md text={m.content} /></div>)}
        {live !== null && <div className="bubble bubble--coach"><div className="coach__who"><span className="coach__dot"><Sparkles size={12} /></span>Path</div>{live ? <Md text={live} /> : null}<span className="caret" /></div>}
        {err && <Notice>{err}</Notice>}
      </div>

      <form className="composer" onSubmit={e => { e.preventDefault(); send(text); }}>
        <textarea rows={1} value={text} placeholder="Message your coach" aria-label="Message your coach"
          onChange={e => { setText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text); } }} />
        {live !== null
          ? <button type="button" className="btn btn--ghost" onClick={stop} aria-label="Stop"><Square size={16} /></button>
          : <button className="btn btn--primary" disabled={!text.trim()} aria-label="Send"><ArrowUp size={18} /></button>}
      </form>
    </div>
  );
}
