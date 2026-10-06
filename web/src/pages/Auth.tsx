import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Linkedin } from 'lucide-react';
import { api } from '../lib/api';
import { Brand } from '../App';
import { useAuth } from '../lib/auth';
import { Field, Notice } from '../components/ui';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [li, setLi] = useState(false);
  useEffect(() => { api<{ linkedin?: boolean }>('/health').then(h => setLi(!!h.linkedin)).catch(() => {}); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (mode === 'login') { await login(email, password); nav('/app'); }
      else { await register(name, email, password); nav('/app/start'); }
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit}>
        <Brand />
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">{mode === 'login' ? 'Sign in to your competency map and resumes.' : 'It takes two minutes to map your subjects to skills.'}</p>
        {mode === 'register' && <Field label="Full name"><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required /></Field>}
        <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field>
        <Field label="Password" hint={mode === 'register' ? 'At least 8 characters.' : undefined}><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required /></Field>
        {li && <><a className="btn btn--linkedin btn--wide" href="/api/auth/linkedin"><Linkedin size={17} /> Continue with LinkedIn</a><div className="or"><span>or with email</span></div></>}
        <Notice>{error}</Notice>
        <button className="btn btn--primary btn--wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <p className="muted small center">{mode === 'login' ? <>New here? <Link to="/register">Create an account</Link></> : <>Already registered? <Link to="/login">Sign in</Link></>}</p>
      </form>
    </div>
  );
}

/** Landing spot after LinkedIn sends the user back: #token=… or #error=… */
export function LinkedInDone() {
  const { useToken } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState('');
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    if (h.get('error')) { setErr(h.get('error')!); return; }
    const t = h.get('token');
    if (!t) { setErr('Sign-in did not complete.'); return; }
    useToken(t);
    history.replaceState(null, '', '/auth/linkedin');
    nav(h.get('linked') === '1' ? '/app/profile?tab=import' : h.get('new') === '1' ? '/app/start' : '/app', { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="auth"><div className="auth__card"><Brand />{err ? <><Notice>{err}</Notice><Link className="btn btn--primary" to="/login">Back to sign in</Link></> : <p className="muted">Signing you in with LinkedIn…</p>}</div></div>;
}

/** Recruiters invited by an admin set their own password at first sign-in. */
export function SetPassword() {
  const { clearMustChange, user } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    if (pw !== pw2) { setErr('The passwords do not match.'); return; }
    try { await api('/me/password', { method: 'PUT', body: { next: pw } }); clearMustChange(); } catch (x) { setErr((x as Error).message); }
  };
  return (
    <div className="auth">
      <form className="auth__card" onSubmit={save}>
        <Brand />
        <h1>Welcome, {user?.name.split(' ')[0]}</h1>
        <p className="muted">Your account was created by a PathForward admin. Choose your own password to continue.</p>
        <Field label="New password" hint="At least 8 characters."><input type="password" value={pw} onChange={e => setPw(e.target.value)} minLength={8} required autoComplete="new-password" /></Field>
        <Field label="Repeat it"><input type="password" value={pw2} onChange={e => setPw2(e.target.value)} minLength={8} required autoComplete="new-password" /></Field>
        <Notice>{err}</Notice>
        <button className="btn btn--primary btn--wide">Save and continue</button>
      </form>
    </div>
  );
}
