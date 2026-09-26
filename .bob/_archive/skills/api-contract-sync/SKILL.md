---
name: api-contract-sync
description: Reconcile frontend/src/api.ts with the Pydantic schemas it mirrors when `make contract` fails, or after any change to backend/app/schemas/** or a route's response_model. Use when a contract mismatch is reported, when adding or renaming a response field, or before commit on any full-stack change.
allowed-tools: Read, Grep, Glob, Edit, Bash
---

# API contract sync

`frontend/src/api.ts` is a hand-maintained mirror of `backend/app/schemas/**`.
No shared type checker spans them: ruff, pytest, `tsc --noEmit` and `vite build`
all pass on a mirror that no longer matches. `scripts/check-api-contract.py` is
the only thing that sees that seam.

## Run it

```bash
make contract              # fatal drift only — this is the gate in `make lint`
make contract ARGS=--strict   # also fails where api.ts is merely looser
```

## The two severities

**FATAL — fix before commit.**

| Report | Means |
|---|---|
| `X.f  in Pydantic, missing from api.ts` | field added or renamed backend-side; the mirror never followed |
| `X.f  in api.ts, missing from Pydantic` | field removed backend-side, or a typo in the mirror |
| `X.f  nullable in Pydantic, non-nullable in api.ts` | the server can send `null` where TS promises a value — this is the one that crashes at runtime |

**ADVISE — do not "fix" reflexively.** `optional in api.ts, always sent by
Pydantic` is correct for request models: the client omits the field and the
server applies its default. On a response model it is defensive, not wrong.
Tighten only when you have checked the call sites.

## Fixing

1. **Pydantic is the source of truth.** Change `api.ts` to match the schema,
   not the reverse — unless the schema itself is the bug, in which case fix the
   schema and rerun.
2. Mirror the **alias**, not the Python name: `Field(alias="nextSession")`
   means the TS field is `nextSession`. The checker reports alias names already.
3. Nullability maps as `T | None` ⟺ `f?: T | null`. A Pydantic default
   (`x: bool = True`) does **not** make the TS field optional on a response.
4. Never add a participant id to a request shape. The backend derives the
   acting participant from the access token; a client-supplied id on a write
   route is a forgery primitive (`api.ts` header).

## After fixing

Per the `cook` skill §10, a changed response shape also needs:

- `make openapi` — the route shapes are generated; `make lint` fails while the
  dump is stale. Never hand-write the new shape into a doc.
- `docs/reference/backend.md` — only if the route index changed, or if the change carries
  behaviour the schema cannot show
- `docs/reference/architecture.md` — only if a domain noun, boundary or invariant changed

Then `make lint` (ruff → contract → openapi → frontend build) and `make test`.

## Limits — what this does not catch

Names and nullability only. It does **not** compare types, so `str` → `int` or a
widened `Literal` passes. It compares models the two sides **name identically**;
the 7 unmirrored schemas in the note line are unchecked by design (server-
internal). Boundary rules — no direct Supabase writes from the frontend, no
student PII in logs — are invisible to it; those live in `docs/reference/architecture.md`
and need a reviewer.
