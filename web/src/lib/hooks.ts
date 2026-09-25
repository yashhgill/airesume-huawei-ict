import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** Load JSON from the API with loading/error state and a reload function. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try { setData(await api<T>(path)); setError(null); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

/** Run an async action with busy + error state. */
export function useAction<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (...a: A) => {
    setBusy(true); setError(null);
    try { return await fn(...a); }
    catch (e) { setError((e as Error).message); return undefined; }
    finally { setBusy(false); }
  }, [fn]);
  return { run, busy, error, setError };
}
