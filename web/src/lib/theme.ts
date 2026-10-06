import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'pf.theme';

export function applyTheme(t: ThemePref) {
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121410' : '#F4F3EE');
}

export function initialTheme(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; }
}

export function useTheme() {
  const [t, setT] = useState<ThemePref>(initialTheme);
  useEffect(() => {
    applyTheme(t);
    try { t === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, t); } catch { /* private mode */ }
    if (t !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const f = () => applyTheme('system');
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [t]);
  return [t, setT] as const;
}
