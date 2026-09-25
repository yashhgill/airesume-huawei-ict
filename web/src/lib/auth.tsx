import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { api, tokenStore } from './api';
import type { User } from './types';

interface Auth { user: User | null; ready: boolean; login: (email: string, password: string) => Promise<void>; register: (name: string, email: string, password: string) => Promise<void>; logout: () => void }
const Ctx = createContext<Auth | null>(null);
export const useAuth = () => useContext(Ctx)!;

function decode(token: string): User | null {
  try {
    const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (p.exp && p.exp < Date.now() / 1000) return null;
    return { id: p.sub, email: p.email, role: p.role, name: p.name };
  } catch { return null; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => { const t = tokenStore.get(); return t ? decode(t) : null; });
  const logout = useCallback(() => { tokenStore.set(null); setUser(null); }, []);
  useEffect(() => { const f = () => setUser(null); window.addEventListener('auth:logout', f); return () => window.removeEventListener('auth:logout', f); }, []);
  const done = (r: { token: string; user: User }) => { tokenStore.set(r.token); setUser(r.user); };
  const login = async (email: string, password: string) => done(await api('/auth/login', { body: { email, password } }));
  const register = async (name: string, email: string, password: string) => done(await api('/auth/register', { body: { name, email, password } }));
  return <Ctx.Provider value={{ user, ready: true, login, register, logout }}>{children}</Ctx.Provider>;
}
