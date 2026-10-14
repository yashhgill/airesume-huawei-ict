-- SQLite compatibility so the app's SQL runs unchanged: datetime('now'[, '-N days'|'-N hours'|...]) → 'YYYY-MM-DD HH:MM:SS' text (UTC)
CREATE OR REPLACE FUNCTION datetime(ts text, modifier text DEFAULT NULL) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE t timestamptz; m text[];
BEGIN
  IF ts IS NULL THEN RETURN NULL; END IF;
  t := CASE WHEN lower(ts) = 'now' THEN now() ELSE (ts::timestamp AT TIME ZONE 'UTC') END;
  IF modifier IS NOT NULL THEN
    m := regexp_match(trim(modifier), '^([+-]?\d+(?:\.\d+)?)\s+(second|minute|hour|day|month|year)s?$', 'i');
    IF m IS NOT NULL THEN t := t + (m[1] || ' ' || m[2])::interval; END IF;
  END IF;
  RETURN to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS');
END $$;
ALTER FUNCTION datetime(text, text) VOLATILE;

-- Shared secret the Worker presents; only readable inside SECURITY DEFINER functions
CREATE TABLE IF NOT EXISTS pf_secret (id int PRIMARY KEY DEFAULT 1, secret text NOT NULL);
ALTER TABLE pf_secret ENABLE ROW LEVEL SECURITY;

-- Run one statement. Reads return {rows:[...]}; writes return {changes:n, rows:[RETURNING rows]}.
CREATE OR REPLACE FUNCTION pf_exec(secret text, q text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE res jsonb; n bigint; head text := lower(ltrim(q));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pf_secret s WHERE s.secret = pf_exec.secret) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF head LIKE 'select%' OR head LIKE 'with%' OR q ~* '\sreturning\s' THEN
    EXECUTE 'WITH pf_q AS (' || q || ') SELECT COALESCE(jsonb_agg(to_jsonb(pf_q)), ''[]''::jsonb) FROM pf_q' INTO res;
    RETURN jsonb_build_object('rows', res, 'changes', jsonb_array_length(res));
  END IF;
  EXECUTE q; GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('rows', '[]'::jsonb, 'changes', n);
END $$;

-- Run several statements atomically (D1 batch semantics)
CREATE OR REPLACE FUNCTION pf_batch(secret text, qs text[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE out jsonb := '[]'::jsonb; q text;
BEGIN
  FOREACH q IN ARRAY qs LOOP out := out || jsonb_build_array(pf_exec(secret, q)); END LOOP;
  RETURN out;
END $$;
REVOKE ALL ON FUNCTION pf_exec(text, text) FROM public;
REVOKE ALL ON FUNCTION pf_batch(text, text[]) FROM public;
GRANT EXECUTE ON FUNCTION pf_exec(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pf_batch(text, text[]) TO anon, authenticated, service_role;

-- After bulk copies: identity columns continue after the highest id
CREATE OR REPLACE FUNCTION pf_fix_sequences() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0; BEGIN
  FOR r IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='id' AND is_identity='YES' LOOP
    EXECUTE format('SELECT setval(pg_get_serial_sequence(%L,''id''), COALESCE((SELECT MAX(id) FROM %I),0)+1, false)', r.table_name, r.table_name); n := n + 1;
  END LOOP; RETURN n; END $$;
REVOKE ALL ON FUNCTION pf_fix_sequences() FROM public;
