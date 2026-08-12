# Tailscale phone access design

## Goal

Allow a phone already joined to the owner's tailnet to use the locally hosted
Wardrowbe web app through one private HTTPS URL. Keep FastAPI, PostgreSQL, and
Redis bound to loopback. Do not expose development credentials or add a separate
identity service.

## Selected design

Use Tailscale Serve on unused HTTPS port `8445` to proxy the loopback Next.js
frontend. Add a NextAuth credentials-style provider whose only credential source
is the identity headers inserted by Tailscale Serve:

- `Tailscale-User-Login`
- `Tailscale-User-Name`
- `Tailscale-User-Profile-Pic`

Tailscale Serve removes client-supplied copies of these headers before inserting
verified tailnet identity. Wardrowbe trusts them only when explicitly started
with Tailscale authentication enabled and only while Next.js listens on
`127.0.0.1`.

The phone URL will be:

`https://g7x9r272rq.tail37713f.ts.net:8445/login`

## Authentication flow

1. Phone establishes an authenticated Tailscale connection to the Mac.
2. Tailscale Serve terminates HTTPS and proxies the request to
   `127.0.0.1:3000`.
3. Login page shows `Sign in with Tailscale`.
4. NextAuth callback reads Serve-injected identity headers. Missing login header
   rejects authentication.
5. Provider maps login, display name, and optional profile image into the
   existing NextAuth user shape.
6. Existing NextAuth JWT callback synchronizes the verified identity with
   FastAPI through `127.0.0.1:8001` and receives the normal Wardrowbe API token.

No direct browser access to FastAPI is needed. Existing frontend API proxy
continues to call FastAPI over loopback.

## Security boundaries

- Tailscale mode is opt-in through a dedicated environment switch.
- Arbitrary-email development login is disabled whenever Tailscale mode is
  enabled, including during `next dev`.
- Tailscale provider is absent when the switch is disabled.
- Next.js remains loopback-only. This prevents LAN or tailnet clients from
  bypassing Serve and supplying forged identity headers.
- FastAPI remains loopback-only on port `8001`.
- Tailscale Funnel is not enabled. URL remains private to permitted tailnet
  identities.
- Existing NextAuth secret and backend secret remain required.

This configuration authenticates the current tailnet user. Later family access
requires adding each family member to the tailnet or replacing this temporary
identity path with the planned self-hosted/public OIDC design.

## Components

### Identity-header parser

A small pure helper normalizes the request header representation, requires a
non-empty login, derives a stable ID from that login, and returns optional name
and profile image values. Keeping parsing separate makes the trust input easy to
test.

### NextAuth provider selection

Provider selection follows this precedence:

1. Configured OIDC provider.
2. Tailscale provider when Tailscale mode is enabled.
3. Development provider only when Tailscale mode is disabled and development
   login is enabled.

OIDC remains available for future deployment. Tailscale mode and arbitrary dev
login never coexist.

### Login page

Provider discovery recognizes the Tailscale provider and renders one sign-in
button. No email or name field is shown.

### Runtime configuration

Restart frontend with:

- Tailscale authentication enabled.
- `NEXTAUTH_URL` set to the private HTTPS URL.
- backend URL set to `http://127.0.0.1:8001`.
- host bound to `127.0.0.1`, port `3000`.

Configure Tailscale Serve HTTPS port `8445` to proxy
`http://127.0.0.1:3000` in background mode. Existing Serve ports and handlers
remain unchanged.

## Failure behavior

- Missing Tailscale login header: NextAuth returns `CredentialsSignin`; no user
  is synchronized.
- Backend unavailable: existing sync error is shown; identity session does not
  gain an API token.
- Phone not connected or not permitted by tailnet policy: Tailscale blocks
  access before Wardrowbe.
- Frontend stopped: Serve returns upstream failure without exposing another
  service.

## Testing

Follow test-driven development:

1. Provider-selection tests prove Tailscale mode excludes dev credentials and
   disabled mode excludes Tailscale provider.
2. Parser/provider tests prove valid identity mapping and rejection when login
   header is absent.
3. Login-page test proves Tailscale provider produces the correct sign-in action.
4. Run full frontend tests, locale checks, lint, and production build.
5. Smoke-test the private HTTPS login page and proxied backend health from the
   Mac, then verify both app listeners remain loopback-only.

Phone validation requires opening the URL on the Tailscale-connected phone and
completing one sign-in.

## Versioning and rollback

Commit application changes separately on `personal`, then push to
`origin/personal`. Do not modify official `main`.

Rollback runtime exposure with:

`tailscale serve --https=8445 off`

Then restart frontend without Tailscale authentication. Code rollback is one
revertible personal-branch commit.
