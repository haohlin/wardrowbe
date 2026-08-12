# Authentication and deployment boundaries

## Current official design

Wardrowbe uses NextAuth as its browser session layer and an OIDC provider as account authority. The frontend requests `openid email profile` and enables PKCE and state checks. On first sign-in it sends the OIDC ID token to `/api/v1/auth/sync`; the backend verifies signature, issuer, audience, expiry, subject, and email consistency before issuing its own API JWT.

Development credentials accept arbitrary email/name values. They are suitable only while frontend and backend listen on loopback. They are not family authentication and must never be used on a LAN, Tailscale, or public listener.

When OIDC is configured, it is the exclusive browser provider. `DEV_MODE=true`
is required to enable development credentials, and OIDC still takes precedence.

## Native iOS private deployment

The implemented private deployment uses Tailscale Serve for Wardrowbe at
`https://g7x9r272rq.tail37713f.ts.net:8445` and Dex at
`https://g7x9r272rq.tail37713f.ts.net:8446/dex`. Services behind both origins
remain bound to loopback, and Tailscale Funnel remains disabled.

The official iOS app must receive only the Wardrowbe origin. Do not append
`/api/v1`; the app constructs that path. Dex provides a public PKCE mobile
client and a confidential web client. Its Tailscale connector consumes identity
headers added by Tailscale Serve, while its Email option uses a local bcrypt
password. Both verified login methods must present the same email so they map to
one internal Wardrowbe user.

Setup, status, backup, rotation, and rollback commands are documented in
`deploy/tailscale-oidc/README.md`.

## Mac test phase

- Frontend: `127.0.0.1:3000` only.
- Backend: `127.0.0.1:8000` only.
- PostgreSQL and Redis: local machine only; no router forwarding or public bind.
- Authentication: development credentials for this Mac test only.
- Caddy/public TLS/GitHub Pages: not part of this phase.

## Family phase

Keep transport private with Tailscale and add a lightweight, free, self-hosted OIDC provider before family access. Dex is the planned first evaluation because one small service can hold developer-created password accounts and expose standard OIDC. Family members should receive one URL plus credentials; account creation and provider administration remain developer-only.

This phase still requires valid TLS, strong generated secrets, disabled development login, provider backups, and a tested recovery account. Tailscale limits network reachability; OIDC decides which reachable user may sign in. Both controls remain useful.

## GitHub Pages and future public launch

GitHub Pages can host static frontend files on a free personal account, but it cannot run NextAuth server routes or the FastAPI backend. Current official frontend depends on server-side Next.js routes, so it is not directly deployable as a Pages-only static export.

A future public design has two viable paths:

1. Host current Next.js frontend and FastAPI backend on public HTTPS infrastructure. This preserves official auth design and requires the least application change.
2. Refactor frontend into a static OIDC public client for GitHub Pages, then expose backend through a public HTTPS API with strict CORS, token validation, rate limits, and abuse controls.

Path 1 is preferred for initial public launch. Path 2 is possible, but GitHub Pages saves only static frontend hosting cost; backend, database, storage, domain/TLS operations, backups, email, and monitoring still need hosting. No public launch should occur until gates in `SECURITY_BACKLOG.md` are closed.
