import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';

export function PageHead({ eyebrow, title, sub, actions }: { eyebrow?: string; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="pagehead">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {sub && <p className="pagehead__sub">{sub}</p>}
      </div>
      {actions && <div className="pagehead__actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, eyebrow, actions, children, className = '' }: { title?: ReactNode; eyebrow?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="card__head">
          <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}{title && <h2>{title}</h2>}</div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export const Spinner = ({ label }: { label?: string }) => <span className="spinner"><Loader2 size={16} className="spin" />{label}</span>;

export function Notice({ tone = 'error', children }: { tone?: 'error' | 'info' | 'ok'; children: ReactNode }) {
  if (!children) return null;
  return <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}><AlertCircle size={16} /><span>{children}</span></div>;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return <div className="empty"><span className="empty__icon">{icon}</span><h3>{title}</h3>{children}</div>;
}

export function Tag({ tone = 'plain', children }: { tone?: 'plain' | 'ok' | 'warn' | 'bad' | 'accent' | 'info'; children: ReactNode }) {
  return <span className={`tag tag--${tone}`}>{children}</span>;
}

export function Meter({ value, label }: { value: number; label?: string }) {
  const tone = value >= 67 ? 'ok' : value >= 30 ? 'warn' : 'bad';
  return (
    <div className="meter" aria-label={label ? `${label} ${value}%` : `${value}%`}>
      <div className={`meter__fill meter__fill--${tone}`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Score({ value, size = 88, label }: { value: number; size?: number; label?: string }) {
  const r = 40, c = 2 * Math.PI * r;
  const tone = value >= 70 ? 'var(--ok)' : value >= 45 ? 'var(--warn)' : 'var(--bad)';
  return (
    <div className="score" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r={r} className="score__track" /><circle cx="50" cy="50" r={r} className="score__val" style={{ stroke: tone, strokeDasharray: `${(c * value) / 100} ${c}` }} /></svg>
      <div><b>{value}</b>{label && <span>{label}</span>}</div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal__card ${wide ? 'modal__card--wide' : ''}`}>
        <div className="modal__head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="field__label">{label}</span>{children}{hint && <span className="field__hint">{hint}</span>}</label>;
}
