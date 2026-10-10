-- Public profile page (pathforward …/p/<slug>) that students can link from their resume
ALTER TABLE users ADD COLUMN public_slug TEXT;
ALTER TABLE users ADD COLUMN public_profile INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN public_views INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS users_public_slug ON users(public_slug) WHERE public_slug IS NOT NULL;
