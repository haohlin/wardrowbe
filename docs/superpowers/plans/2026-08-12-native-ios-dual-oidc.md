# Native iOS Dual OIDC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run Wardrowbe privately over Tailscale so the official iOS app can use the local API and authenticate through Dex with either Tailscale identity or one local password.

**Architecture:** Tailscale Serve proxies Next.js on HTTPS port 8445 and Dex on HTTPS port 8446. Dex exposes one confidential web client and one public PKCE mobile client, backed by its AuthProxy and local-password methods. FastAPI validates Dex ID tokens and issues stable internal-user API tokens so changing Dex methods does not invalidate another Wardrowbe session.

**Tech Stack:** FastAPI, SQLAlchemy, NextAuth, Dex v2.45.1, Docker Compose, Tailscale Serve, Bash, pytest, Vitest

## Global Constraints

- Work only on `personal`; do not recreate a temporary branch or worktree.
- Keep Next.js, FastAPI, Dex, PostgreSQL, and Redis bound to loopback.
- Keep Tailscale Funnel disabled; use Serve only.
- Never persist or print the plaintext local password.
- Keep generated secrets, hashes, Dex state, PIDs, and logs under ignored `deploy/tailscale-oidc/runtime/`.
- Official iOS app server origin is `https://g7x9r272rq.tail37713f.ts.net:8445`; app adds `/api/v1` itself.
- Mobile OIDC callback is `https://g7x9r272rq.tail37713f.ts.net:8445/api/v1/auth/mobile-callback`.

---

### Task 1: Stable API tokens and safe frontend provider selection

**Files:**
- Modify: `backend/app/api/auth.py`
- Modify: `backend/app/utils/auth.py`
- Modify: `backend/tests/test_auth.py`
- Modify: `backend/tests/test_security.py`
- Modify: `frontend/lib/auth.ts`
- Create: `frontend/lib/auth-providers.ts`
- Create: `frontend/tests/auth-providers.test.ts`

**Interfaces:**
- Produces: `create_user_access_token(user: User, expires_delta: timedelta | None = None) -> str`
- Produces: `resolveTokenSubject(user_service: UserService, subject: str) -> User | None`
- Produces: `selectAuthProviderIds(env: AuthProviderEnvironment) -> ('oidc' | 'dev-credentials')[]`
- Preserves: `create_access_token(subject: str, ...)` for legacy tests and existing callers.

- [ ] **Step 1: Write failing backend tests**

Add tests proving `/auth/sync` returns a JWT whose `sub` is `str(user.id)`, internal UUID subjects resolve through `get_current_user`, legacy external-ID subjects still resolve, and two verified OIDC subjects sharing one email produce stable tokens that both resolve the same user.

- [ ] **Step 2: Run backend tests and verify RED**

Run:

```bash
cd backend
TEST_DATABASE_URL=postgresql+asyncpg://wardrobe:wardrobe@localhost:5432/wardrobe_test ../.venv/bin/pytest tests/test_auth.py tests/test_security.py -q
```

Expected: new assertions fail because sync still signs `user.external_id` and current-user lookup only checks external ID.

- [ ] **Step 3: Implement stable subject resolution**

Add `create_user_access_token()` in `backend/app/api/auth.py` and use it from `sync_user()`. In `backend/app/utils/auth.py`, parse token subject as UUID; look up internal user ID first; if no matching user exists, fall back to `get_by_external_id()` for old tokens. Reuse one helper from required and optional authentication paths.

- [ ] **Step 4: Run backend tests and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass.

- [ ] **Step 5: Write failing frontend provider-selection tests**

Test these exact cases:

```typescript
expect(selectAuthProviderIds({ oidcIssuerUrl: 'https://idp/dex', devMode: 'true', nodeEnv: 'development' }))
  .toEqual(['oidc']);
expect(selectAuthProviderIds({ devMode: 'true', nodeEnv: 'development' }))
  .toEqual(['dev-credentials']);
expect(selectAuthProviderIds({ devMode: 'false', nodeEnv: 'development' }))
  .toEqual([]);
```

- [ ] **Step 6: Run frontend test and verify RED**

Run `cd frontend && npm test -- tests/auth-providers.test.ts`. Expected: module is missing.

- [ ] **Step 7: Implement provider selection**

Create pure selector in `frontend/lib/auth-providers.ts`. OIDC takes exclusive precedence. Development credentials require explicit `DEV_MODE=true`; `NODE_ENV=development` alone never enables them. Make `frontend/lib/auth.ts` construct provider objects from returned IDs.

- [ ] **Step 8: Run selected backend/frontend tests and commit**

Run both selected suites, then:

```bash
git add backend/app/api/auth.py backend/app/utils/auth.py backend/tests/test_auth.py backend/tests/test_security.py frontend/lib/auth.ts frontend/lib/auth-providers.ts frontend/tests/auth-providers.test.ts
git commit -m "feat(auth): support stable dual OIDC sessions"
```

### Task 2: Reproducible private Dex deployment

**Files:**
- Modify: `.gitignore`
- Create: `deploy/tailscale-oidc/compose.yaml`
- Create: `deploy/tailscale-oidc/dex.yaml.template`
- Create: `deploy/tailscale-oidc/render_config.py`
- Create: `deploy/tailscale-oidc/setup.sh`
- Create: `deploy/tailscale-oidc/wardrowbe.sh`
- Create: `deploy/tailscale-oidc/check.sh`
- Create: `deploy/tailscale-oidc/tests/test_render_config.py`
- Create: `deploy/tailscale-oidc/tests/test_scripts.py`

**Interfaces:**
- `render_config.py ENV_FILE TEMPLATE OUTPUT` reads mode-600 generated values and atomically writes mode-600 Dex YAML.
- `setup.sh` generates runtime secrets/hash, starts Dex, configures only Serve 8445/8446, and never resets existing Serve handlers.
- `wardrowbe.sh start|stop|status` manages loopback frontend/backend/worker processes with PID files.
- `check.sh` exits nonzero unless Dex discovery, Wardrowbe auth config, callback, and both Serve origins work.

- [ ] **Step 1: Write failing renderer and script-policy tests**

Tests assert rendered YAML contains issuer, public `wardrowbe-mobile`, confidential `wardrowbe-web`, both redirect URIs, AuthProxy headers, password hash, and no plaintext password. Static script tests assert loopback binds, pinned Dex tag, `tailscale serve` commands, absence of `tailscale funnel`, and no `serve reset`.

- [ ] **Step 2: Run deployment tests and verify RED**

Run:

```bash
python3 -m pytest deploy/tailscale-oidc/tests -q
```

Expected: deployment modules/files are missing.

- [ ] **Step 3: Implement renderer, template, and Compose service**

Use placeholders for issuer, web secret, owner email, bcrypt hash, and stable owner UUID. Configure Dex AuthProxy with `Tailscale-User-Login` for user ID/email and `Tailscale-User-Name` for name. Publish Dex as `127.0.0.1:5556:5556`, mount rendered config read-only, and persist `/var/dex` in a named volume.

- [ ] **Step 4: Implement secure setup and process scripts**

`setup.sh` must:

1. Derive current MagicDNS name and Tailscale login from `tailscale status --json`.
2. Require login DNS name to match expected current server identity.
3. Use `htpasswd -nBC 12 "$owner_email"` so password is entered without appearing in argv.
4. Generate client/JWT/session secrets with `openssl rand`.
5. Check existing Wardrowbe users contain matching normalized email without printing user rows.
6. Render config, start Dex, wait for discovery, then run:

```bash
tailscale serve --bg --https=8445 http://127.0.0.1:3000
tailscale serve --bg --https=8446 http://127.0.0.1:5556
```

`wardrowbe.sh` sources existing ignored app env plus generated OIDC env, forces `DEBUG=false` and `DEV_MODE=false`, and binds all three processes to loopback.

- [ ] **Step 5: Implement health checks and verify GREEN**

Run deployment pytest, `bash -n` on every shell file, `python3 -m py_compile render_config.py`, and `docker compose -f deploy/tailscale-oidc/compose.yaml config` with a test runtime config.

- [ ] **Step 6: Commit deployment artifacts**

```bash
git add .gitignore deploy/tailscale-oidc
git commit -m "feat(deploy): add private Dex OIDC runtime"
```

### Task 3: Operator documentation and full verification

**Files:**
- Create: `deploy/tailscale-oidc/README.md`
- Modify: `docs/AUTH_AND_DEPLOYMENT.md`

**Interfaces:**
- Documents one setup command, iOS server origin, two login paths, status checks, secret rotation, backup, and rollback.

- [ ] **Step 1: Write documentation**

State exact iOS value `https://g7x9r272rq.tail37713f.ts.net:8445`, explicitly forbid adding `/api/v1`, and distinguish `Tailscale` from `Email` inside Dex. Document that both must use same email to preserve one wardrobe.

- [ ] **Step 2: Run full static and application verification**

Run:

```bash
cd backend && TEST_DATABASE_URL=postgresql+asyncpg://wardrobe:wardrobe@localhost:5432/wardrobe_test ../.venv/bin/pytest -q
cd backend && ../.venv/bin/ruff check app tests && ../.venv/bin/ruff format --check app tests
cd frontend && npm test
cd frontend && npm run i18n:check
cd frontend && npm run build
python3 -m pytest deploy/tailscale-oidc/tests -q
```

- [ ] **Step 3: Commit docs**

```bash
git add deploy/tailscale-oidc/README.md docs/AUTH_AND_DEPLOYMENT.md
git commit -m "docs: add native iOS private login runbook"
```

### Task 4: Activate and smoke-test local runtime

**Files:**
- Generated only: `deploy/tailscale-oidc/runtime/*`

**Interfaces:**
- Produces live Wardrowbe origin `https://g7x9r272rq.tail37713f.ts.net:8445`.
- Produces live Dex issuer `https://g7x9r272rq.tail37713f.ts.net:8446/dex`.

- [ ] **Step 1: Run secure interactive setup**

Run `./deploy/tailscale-oidc/setup.sh`. Enter local-password credentials only at terminal prompt.

- [ ] **Step 2: Restart Wardrowbe under OIDC runtime**

Stop existing loopback Wardrowbe processes after confirming their exact PIDs, then run `./deploy/tailscale-oidc/wardrowbe.sh start`.

- [ ] **Step 3: Run automated smoke checks**

Run `./deploy/tailscale-oidc/check.sh`. Expected: Dex discovery, Wardrowbe health/config, mobile callback, Serve 8445, and Serve 8446 all pass; `/auth/config` reports OIDC enabled with `wardrowbe-mobile` and `dev_mode=false`.

- [ ] **Step 4: Verify repository and runtime boundaries**

Confirm runtime directory ignored, no tracked secret-like values, listeners remain loopback-only, Funnel disabled, and unrelated Serve ports 443/8443/8444 unchanged.

- [ ] **Step 5: Phone acceptance test**

In official app, enter `https://g7x9r272rq.tail37713f.ts.net:8445`. Complete Tailscale login, inspect wardrobe, log out, complete Email login, and confirm same wardrobe. Phone action is final manual gate; server-side completion does not claim this step until performed.
