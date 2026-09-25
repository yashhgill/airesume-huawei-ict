# AI Resume · Competency to Career

**11th Huawei ICT Competition 2026 · Innovation Track (Topic 1: AI applications powered by Huawei Cloud) · UTeM FTMK**

AI Resume turns what a student actually studied into evidence employers can trust. Students tick the subjects they completed; each subject's course learning outcomes (CLOs) map to the programme learning outcomes (PLOs, MQA domains) and to concrete skills. The AI then writes honest, ATS-friendly resumes from that record, checks them against real job ads, and ranks live job openings by fit.

## Features

| Area | What it does |
|---|---|
| Competency map | Programme → subjects → CLOs → PLO coverage (11 MQA domains), radar chart, evidence per outcome, gap hints |
| Skills | Curriculum skills added instantly with evidence; AI suggests soft skills and tools from CLOs and experience |
| Readiness score | Weighted profile completeness with next-step advice |
| Resume builder | AI writes a one-page resume for a target role (optionally tailored to a job ad) using only facts from the profile; three templates; inline editing; PDF export |
| ATS check | Keyword match (deterministic) + recruiter-style AI review → score, missing keywords, truthful rewrites |
| Career paths | Five entry-level Malaysian roles with fit %, missing skills, MYR starting salary, certifications (Huawei HCIA first), learning path |
| Job search | Live jobs from Remotive and Arbeitnow (and JSearch/Google Jobs incl. Malaysia with a RapidAPI key), ranked by skill fit; deep AI fit; tailor resume; save |
| Application tracker | Kanban: saved → applied → interview → offer / closed, with notes |
| CV import | Upload a PDF; AI extracts education, experience, skills; review before saving |
| Cover letters | Generated per job, editable, copy to clipboard |
| Admin console | Usage KPIs, AI latency and failure rate, users and roles, curriculum editor (subjects, CLOs, PLO mapping, skills), activity log |

## Architecture

```
Browser (React SPA)
   │  /api/*  (JSON, JWT auth)
   ▼
Hono API  ── same code on both runtimes ───────────────────────────────┐
   │                                                                  │
   ├─ Cloudflare Workers  + D1 (SQLite)        ← development / demo    │
   └─ Huawei Cloud ECS    + Node 22 + SQLite   ← competition submission│
        Nginx reverse proxy, systemd service, Cloudflare DNS in front  │
   │                                                                  │
   ├─ Groq (OpenAI-compatible) · gpt-oss-120b  ← all AI tasks        │
   └─ Remotive · Arbeitnow · JSearch            ← live job data       │
```

* `server/app.ts`: every API route (auth, profile, AI, resumes, jobs, admin).
* `server/lib/sqlite-d1.ts`: a D1-compatible wrapper over Node's built-in `node:sqlite`, so the identical SQL runs on Cloudflare D1 and on the ECS.
* `server/lib/llm.ts`: one gateway for all AI calls. Change the URL/model to use Huawei ModelArts Studio (MaaS) instead of Groq.
* `server/lib/ai.ts`: prompts. Every prompt forbids inventing employers, dates, grades or skills.
* `server/lib/text.ts`: deterministic keyword/alias matching for instant job ranking and ATS keyword checks.
* `migrations/`: schema + seed (UTeM FTMK programmes, 11 PLOs each, sample subjects with CLOs). Seed subjects are illustrative; edit them in Admin → Curriculum.

Security: PBKDF2-SHA256 password hashing and HS256 JWTs via WebCrypto; all queries parameterised; per-user row checks on every read/write; secrets only in environment variables (`.env`, Wrangler secrets, GitHub secrets). Nothing secret is committed.

## Run locally

```bash
npm install
cp .env.example .env            # add GROQ_API_KEY (free at console.groq.com)
npm run dev                     # API on :8787, web on http://localhost:5173
```

Without a Groq key the app runs, and AI buttons explain the key is missing. For offline demos and tests, `LLM_PROVIDER=mock` returns canned AI output.

```bash
npm test          # end-to-end API tests on a fresh SQLite DB (mock AI, stubbed job APIs)
npm run typecheck
```

## Deploy to Cloudflare (Workers + D1)

Automatic on every push to `main` via `.github/workflows/deploy.yml` (tests → create D1 if missing → migrate → deploy → set secrets).

Add these in GitHub → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare token with *Workers Scripts: Edit* and *D1: Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | From the Cloudflare dashboard sidebar |
| `JWT_SECRET` | Any long random string |
| `GROQ_API_KEY` | From console.groq.com |
| `ADMIN_EMAILS` | Your email (becomes admin on sign-up) |
| `RAPIDAPI_KEY` | Optional, enables JSearch (Malaysian job listings) |
| `CLOUDFLARE_WORKERS_SUBDOMAIN` | Optional, enables the post-deploy health check |

Manual alternative: `npx wrangler login`, `npx wrangler d1 create airesume` (paste the id into `wrangler.toml`), `npm run db:migrate:remote`, `npx wrangler secret put GROQ_API_KEY` (and `JWT_SECRET`), `npm run deploy`.

## Deploy to Huawei Cloud ECS (submission)

1. Create an ECS (Ubuntu 22.04, 2 vCPU / 4 GB is plenty) with an Elastic IP. Security group: allow TCP 80 and 443 from anywhere, 22 from your IP only.
2. SSH in as root and run:
   ```bash
   git clone https://github.com/<you>/<repo>.git /tmp/airesume
   bash /tmp/airesume/deploy/ecs/setup.sh https://github.com/<you>/<repo>.git
   nano /opt/airesume/.env        # set GROQ_API_KEY and ADMIN_EMAILS
   systemctl restart airesume
   ```
3. **Cloudflare DNS**: add an `A` record for your domain (e.g. `airesume.example.my`) pointing to the Elastic IP, proxied (orange cloud). SSL/TLS mode *Flexible*, or *Full* after installing a Cloudflare Origin Certificate in Nginx.
4. Updates: `bash /opt/airesume/deploy/ecs/update.sh`.

Data lives in `/opt/airesume/data/airesume.db` (back it up with `sqlite3 .backup` or a cron copy to OBS).

## Project layout

```
server/        Hono API, D1/SQLite adapter, AI prompts, job providers
web/           React + Vite single-page app
migrations/    SQL schema and seed data
tests/         End-to-end API tests
deploy/ecs/    setup.sh, update.sh, systemd unit, nginx config
.github/       CI + Cloudflare deploy workflow
```

## Honest scope

* Seed subjects and CLOs are samples for demonstration; the real curriculum should be entered by the faculty in the admin console.
* Salary ranges and role suggestions come from the language model and should be treated as guidance.
* Remotive and Arbeitnow list mostly remote/international roles; JSearch (optional key) is needed for broad Malaysian coverage.

## Team

UTeM, Fakulti Teknologi Maklumat dan Komunikasi. Built on ideas from the original [AIResume](https://github.com/yashhgill/AIResume) PHP prototype.
