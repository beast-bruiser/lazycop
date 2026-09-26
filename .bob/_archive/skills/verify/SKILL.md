---
name: verify
description: Run Happier Me locally and drive the real student/portal flows in a browser to observe a change working. Use when asked to run, start or screenshot the app, or to confirm a change behaves correctly in the running app rather than only in tests.
---

# Verify — Happier Me

**Two processes.** FastAPI on :8080 (the agent plane runs *inside* it, at
`backend/app/agent/` — there is no separate AI service) and Vite on :5173.
`make dev` uses Docker; for verification run them on the host so logs are
greppable and restarts are fast.

## Prerequisites

A **real Supabase project is required** — `DATABASE_URL` has no default and the
app refuses to start without one. There is no SQLite dev fallback; only
`backend/tests/conftest.py` uses SQLite. Root `.env` needs `DATABASE_URL`
(`postgresql+asyncpg://…`), `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and **anonymous sign-ins enabled**
in the project — without those the student app stops at its retry card.

Schema comes from Alembic (`uv run alembic upgrade head`), never `create_all`.
Set `SEED_REFERENCE_CIRCLES=1` for the five prototype circles, and
`ENABLE_API_DOCS=1` if you want `/docs`. Provider keys are optional: without
them AI surfaces degrade per-turn and risk screening floors at Yellow — which
is fine for non-AI checks but useless for verifying the companion.

`make check` (`scripts/preflight.py`) confirms the toolchain: Python ≥3.12, Node ≥20.

## Launch

```bash
# 1. backend (FastAPI, :8080)
cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8080

# 2. frontend (Vite, :5173) — MUST override the proxy target, it defaults to
#    the compose service name `backend` and 502s outside Docker
cd frontend && VITE_PROXY_TARGET=http://127.0.0.1:8080 npm run dev
```

Redirect each to a log file and background it, then confirm both:

```bash
curl -s localhost:8080/api/health     # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}' localhost:5173/app
```

## Drive it

**Use `http://localhost:5173`, not `127.0.0.1`** — screenshots via the Chrome
extension time out on the IP form here. Screenshots may fail with "Script
injection timed out" even so; `javascript_tool` works reliably, so drive
through the DOM and read `innerText` as evidence.

React inputs are controlled — set values through the native setter:

```js
window.__type = (el, text) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
```

Scope selectors by the Vietnamese nav/section labels (`copy/nav.ts`) — 
`Góc phản tư` (home), `Hành trình của tôi` (journey), `My Wellbeing Circle`,
`Hồ sơ` (profile):

```js
const s = [...document.querySelectorAll('section')].find(s => s.innerText.includes('Góc phản tư'));
```

## Routes worth driving

`/chat` is a redirect to `/app` — the student app lives under `/app`.

| Surface | Route |
|---|---|
| Reflection space (home) | `/app` |
| A pack / check-in | `/app/mission/:packKey` — its own route, not an overlay |
| Journey, circle, profile | `/app/journey`, `/app/circle`, `/app/profile` |
| Onboarding chain | `/app/onboarding` → baseline → `/app/receipt` |
| Portal | `/portal/dashboard`, `/portal/participants/:id`, `/portal/facilitation` |

## Flows worth driving

- **Check-in filing** → complete a pack at `/app/mission/:packKey`, then
  `GET /api/admin/participants/{id}` shows the submission and its summary.
- **Crisis** (safety-critical, check every student-facing surface) → send
  Vietnamese self-harm phrasing; expect the composer to be replaced by
  `companion/crisis-card.tsx`, and a new `red` entry in the `alerts` array of
  `GET /api/admin/participants/{id}`. Act on it via
  `POST /api/admin/alerts/{id}/acknowledge|assign|resolve`.
- **Sealing** → a conversation never persists its own turns; the transcript is
  uploaded once to `POST /api/chat/seal` and discarded.
- **Assist** → `POST /api/assist` is the only student-facing AI surface a pack
  exposes; confirm it never pre-fills, reorders or skips items.

## Reading evidence from logs

```bash
grep -iE 'agent|provider|tier' backend.log | tail   # agent-plane turns
grep -c 'POST /api/chat' backend.log                # student turns
```

Remember the boundaries in `docs/reference/architecture.md` when reading logs: PII is
stripped before any provider call, and model reasoning is stripped server-side —
if you see either in a log, that is the bug, not the evidence.

Each LLM turn costs ~2.5–3.5s. Add fixed sleeps of ~10s after any action that
triggers one, and avoid sleeps that span a navigation (the evaluation target
detaches).
