import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePref } from '../lib/theme';

const OPTS: { id: ThemePref; icon: typeof Sun; label: string }[] = [
  { id: 'light', icon: Sun, label: 'Light' }, { id: 'system', icon: Monitor, label: 'Match device' }, { id: 'dark', icon: Moon, label: 'Dark' },
];

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const [t, setT] = useTheme();
  if (compact) {
    const i = OPTS.findIndex(o => o.id === t);
    const next = OPTS[(i + 1) % OPTS.length];
    const Cur = OPTS[i].icon;
    return <button className="icon-btn" onClick={() => setT(next.id)} aria-label={`Theme: ${OPTS[i].label}. Switch to ${next.label}`} title={`Theme: ${OPTS[i].label}`}><Cur size={19} /></button>;
  }
  return (
    <div className="theme" role="radiogroup" aria-label="Theme">
      {OPTS.map(o => <button key={o.id} role="radio" aria-checked={t === o.id} className={t === o.id ? 'is-on' : ''} onClick={() => setT(o.id)} title={o.label} aria-label={o.label}><o.icon size={15} /></button>)}
    </div>
  );
}
