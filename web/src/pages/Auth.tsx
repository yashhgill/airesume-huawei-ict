import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
        <Link to="/" className="brand"><span className="brand__mark">AI</span><span>Resume</span></Link>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">{mode === 'login' ? 'Sign in to your competency map and resumes.' : 'It takes two minutes to map your subjects to skills.'}</p>
        {mode === 'register' && <Field label="Full name"><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required /></Field>}
        <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></Field>
        <Field label="Password" hint={mode === 'register' ? 'At least 8 characters.' : undefined}><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required /></Field>
        <Notice>{error}</Notice>
        <button className="btn btn--primary btn--wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <p className="muted small center">{mode === 'login' ? <>New here? <Link to="/register">Create an account</Link></> : <>Already registered? <Link to="/login">Sign in</Link></>}</p>
      </form>
    </div>
  );
}
