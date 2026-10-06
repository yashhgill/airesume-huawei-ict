import { useCallback, useRef, useState } from 'react';

/** Browser dictation (Chrome, Edge, Safari). Appends recognised text via onText. */
export function useDictation(onText: (t: string) => void) {
  const SR = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
  const rec = useRef<any>(null);
  const [on, setOn] = useState(false);
  const start = useCallback(() => {
    if (!SR) return;
    const r = new SR();
    r.lang = 'en-MY'; r.continuous = true; r.interimResults = false;
    r.onresult = (e: any) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim()); };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    r.start(); rec.current = r; setOn(true);
  }, [SR, onText]);
  const stop = useCallback(() => { rec.current?.stop(); setOn(false); }, []);
  return { supported: !!SR, on, start, stop };
}
