---
name: api-lookup
description: Look up any backend HTTP route (request/response shape, status codes, auth rule) or any database table (columns, keys, indexes, RLS policies) from the generated OpenAPI and schema JSON, without reading either file. Use when asked what a route returns or accepts, which routes or tables carry a given field, what roles a route requires, what RLS protects a table, or when adding/changing a route, model or migration (regenerate afterwards).
allowed-tools: Bash, Read, Grep
---

# API lookup

`docs/reference/openapi.json` is generated from the FastAPI app
(`scripts/dump-openapi.py`) — the same Pydantic models the server serialises.
It is the route shapes' only source of truth; there is no hand-written route
reference and writing one back is a regression.

**Never read the JSON.** It is ~250KB. Every command below prints plain text —
one route costs ~100–250 tokens.

```bash
S=.claude/skills/api-lookup/api-lookup.py

python3 $S list                                  # all 71 routes + auth
python3 $S list --prefix /api/admin --method get
python3 $S list --tag packs --auth staff
python3 $S show GET /api/packs/next              # one route, $refs expanded
python3 $S search displayName                    # field or schema -> routes
python3 $S schema AlertOut                       # one component schema
python3 $S regen                                 # rewrite the JSON
```

## `x-auth` — read this before anything else

Every operation carries `x-auth`, derived from the route's real dependency tree
(`app/supabase_auth.py`), so it cannot drift from what is enforced:

| Value | Means |
|---|---|
| `require_role(a, b, …)` | verified account **with** a `Participant` row whose **DB `role` column** is one of these |
| `require_participant` | any authenticated participant — identity lookup, not role-scoped |
| `require_supabase_user` | verified Supabase account, no `Participant` row needed |
| `public` | no auth dependency anywhere in the tree |
| `UNRESOLVED` | an auth-shaped dependency the generator could not decode — **treat as a bug**, not as open |

Two facts `x-auth` cannot show, both binding (`docs/reference/architecture.md` §2):
mentor scoping to own circles is enforced **in the router**, not by the role
gate; and a participant id in a path or body is never sufficient on its own.

## Writing

Read-only. The way to change a shape is to change the Pydantic model in
`backend/app/schemas/**` or the route in `backend/app/routers/**`, then:

```bash
make openapi     # regenerate; `make lint` fails while the JSON is stale
make contract    # frontend/src/api.ts must move in the same commit
```

## Limits

Shapes, status codes and auth only. Behaviour OpenAPI cannot express —
idempotency, background dispatch, what degrades on a provider failure, why a
route 404s instead of 403ing — lives in `docs/reference/backend.md` and
`docs/reference/architecture.md`. If you need to know *why*, read those; if you need to
know *what the wire carries*, use this.
