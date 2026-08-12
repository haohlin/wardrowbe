# Native iOS dual OIDC authentication design

## Goal

Let the official Wardrowbe iOS app connect to the Mac-hosted Wardrowbe API over
private Tailscale HTTPS and sign in either with the phone's verified Tailscale
identity or with one owner-controlled local password. Keep all application,
database, Redis, and identity-provider listeners bound to loopback. Do not use
Tailscale Funnel or expose any service to the public internet.

## User experience

The iPhone stays connected to Tailscale. In Wardrowbe, the user chooses
`Change Server` and enters the Wardrowbe Serve origin without `/api/v1`:

`https://g7x9r272rq.tail37713f.ts.net:8445`

Wardrowbe fetches `/api/v1/auth/config`, sees OIDC enabled, and displays its
OIDC sign-in action. The authorization browser opens Dex on a second private
Serve origin:

`https://g7x9r272rq.tail37713f.ts.net:8446/dex`

Dex offers two methods:

1. `Tailscale`: passwordless login using the identity header inserted by
   Tailscale Serve.
2. `Email`: login using a local Dex email and password.

Both methods return to
`https://g7x9r272rq.tail37713f.ts.net:8445/api/v1/auth/mobile-callback`.
FastAPI forwards the result to `wardrowbe://auth/callback`, the official app
exchanges the authorization code with PKCE, then sends the Dex ID token to
`/api/v1/auth/sync`. FastAPI validates the token and returns its normal API
access token. Existing native screens then use the local Wardrowbe API and
data.

## Architecture

### Private HTTPS routes

- Tailscale Serve HTTPS `8445` proxies `http://127.0.0.1:3000`, the Next.js
  frontend. Existing `/api/v1` rewrites proxy native-app API calls to FastAPI.
- Tailscale Serve HTTPS `8446` proxies `http://127.0.0.1:5556`, Dex.
- FastAPI remains on `127.0.0.1:8001`.
- PostgreSQL and Redis retain their existing loopback-only exposure.
- Funnel stays disabled. No router port forwarding is added.

### Dex

Pin Dex to `ghcr.io/dexidp/dex:v2.45.1`. Persist its SQLite database in a
named Docker volume so signing keys and sessions survive restarts.

Configure two OIDC clients:

- `wardrowbe-web`: confidential client for NextAuth, redirecting to
  `https://g7x9r272rq.tail37713f.ts.net:8445/api/auth/callback/oidc`.
- `wardrowbe-mobile`: public client for the installed iOS app, redirecting to
  `https://g7x9r272rq.tail37713f.ts.net:8445/api/v1/auth/mobile-callback`.

The mobile client has no secret. Authorization Code with S256 PKCE protects
the code exchange. The web client secret, Wardrowbe JWT secret, and generated
password hash remain in ignored mode-600 runtime files. Setup reads the
plaintext local password from a hidden terminal prompt and does not persist it.

Configure two Dex authentication methods:

- AuthProxy connector named `Tailscale`, reading
  `Tailscale-User-Login` as user ID and email and
  `Tailscale-User-Name` as display name. Dex marks this email verified.
- Built-in password database, with one static owner account stored as a bcrypt
  hash. Plaintext password never appears in generated Dex configuration,
  Compose files, Git, process arguments, or logs.

Tailscale Serve strips caller-provided copies of its identity headers before
inserting verified values. Dex listens only on loopback through its published
Docker port, so LAN clients cannot bypass Serve and forge those headers.

### Wardrowbe OIDC configuration

Run frontend and backend with:

- `DEBUG=false`
- `OIDC_ISSUER_URL=https://g7x9r272rq.tail37713f.ts.net:8446/dex`
- `OIDC_CLIENT_ID=wardrowbe-web`
- `OIDC_MOBILE_CLIENT_ID=wardrowbe-mobile`
- `OIDC_CLIENT_SECRET` set only for the confidential web client
- `NEXTAUTH_URL=https://g7x9r272rq.tail37713f.ts.net:8445`

`/api/v1/auth/config` advertises the public mobile client ID while backend ID
token validation accepts both web and mobile audiences. Configured OIDC takes
precedence over development login, so arbitrary-email development auth is off.

### Stable Wardrowbe sessions across both Dex methods

Dex subjects include connector identity. Tailscale and Email therefore issue
different `sub` values even when both use the same verified email. Wardrowbe
already reconciles verified provider migrations by email, but its current API
JWT uses mutable `external_id` as `sub`; switching methods would invalidate an
existing browser or phone session.

New Wardrowbe API tokens use immutable internal `users.id` as `sub`.
Authentication resolves UUID subjects by internal ID. For a compatibility
window, a token whose subject is not a matching internal user ID falls back to
the existing external-ID lookup. This keeps already-issued development tokens
working until expiry while making newly issued sessions stable when the user
switches between Tailscale and Email.

OIDC account reconciliation still requires exact case-normalized email equality
and `email_verified=true` before replacing an external subject. Both selected
Dex methods meet that requirement. Setup verifies that the entered local Dex
email matches the current Mac Tailscale login. Before changing runtime auth, it
shows whether the existing Wardrowbe user email matches without printing other
user records; mismatch stops deployment to prevent an accidental empty account.

## Deployment artifacts

Add a focused private deployment overlay rather than changing default Compose:

- `deploy/tailscale-oidc/compose.yaml`: pinned Dex service, loopback port,
  persistent volume, health check.
- `deploy/tailscale-oidc/dex.yaml.template`: issuer, connectors, public and
  confidential clients, static password entry.
- `deploy/tailscale-oidc/setup.sh`: validates dependencies and inputs, generates
  strong secrets and bcrypt hash into an ignored runtime directory, renders
  config, starts Dex, checks discovery, and configures Serve ports without
  resetting unrelated existing handlers.
- `deploy/tailscale-oidc/start-wardrowbe.sh`: starts or documents exact
  Wardrowbe frontend/backend environment using loopback listeners.
- `deploy/tailscale-oidc/check.sh`: proves listeners, OIDC discovery, auth
  config, mobile callback, and private HTTPS routes.
- `deploy/tailscale-oidc/README.md`: setup, iPhone steps, credential rotation,
  backup, and rollback.

Generated runtime state lives below `deploy/tailscale-oidc/runtime/`, which is
ignored. Scripts never print secret values.

## Failure behavior

- Phone outside the tailnet cannot reach either Serve URL.
- Missing `Tailscale-User-Login` makes the Tailscale connector reject login;
  Email login remains available.
- Wrong local password fails inside Dex without calling Wardrowbe.
- Dex unavailable makes OIDC discovery/login fail; Wardrowbe data services
  remain loopback-only.
- Wardrowbe unavailable makes Serve return an upstream error.
- Email mismatch between Tailscale, Dex password account, and existing
  Wardrowbe user stops automated setup to prevent an accidental empty account.
- Any OIDC token with wrong issuer, audience, signature, expiry, subject, or
  email remains rejected by FastAPI.

## Testing

Follow test-driven development for application behavior:

1. Add tests proving newly issued API tokens contain internal user UUIDs.
2. Add tests proving internal-ID tokens resolve users and legacy external-ID
   tokens still resolve during the compatibility window.
3. Add a regression test proving two verified OIDC subjects with one email
   receive independently valid API tokens for the same user.
4. Add deployment tests that render Dex config and assert public mobile client,
   confidential web client, both login methods, loopback binding, no plaintext
   password, and no Funnel command.
5. Run backend auth/security tests, full backend suite, formatting, and lint.
6. Validate rendered Compose configuration and shell syntax.
7. Smoke-test Dex discovery, Wardrowbe `/auth/config`, mobile callback, and both
   Serve URLs from the Mac.
8. Final phone validation: select server origin, complete Tailscale login, log
   out, complete Email login, and confirm both show the same wardrobe.

## Rollback

Disable only the new routes:

```bash
tailscale serve --https=8445 off
tailscale serve --https=8446 off
```

Stop the Dex overlay, then restart Wardrowbe with its prior environment.
Persistent Dex data and generated secrets remain available for recovery until
the owner explicitly removes them. Reverting the application commit restores
external-ID API token issuance; compatibility lookup means internal-ID tokens
must be allowed to expire or users must sign in again after rollback.

## Out of scope

- Public internet or Funnel access
- Registration for arbitrary users
- Password reset email
- More than one local password account
- Replacing official iOS app code
- Modifying official upstream `main`
