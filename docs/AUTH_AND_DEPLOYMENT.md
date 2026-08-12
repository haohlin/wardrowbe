# Authentication and deployment boundaries

## Current official design

Wardrowbe uses NextAuth as its browser session layer and an OIDC provider as account authority. The frontend requests `openid email profile` and enables PKCE and state checks. On first sign-in it sends the OIDC ID token to `/api/v1/auth/sync`; the backend verifies signature, issuer, audience, expiry, subject, and email consistency before issuing its own API JWT.

Development credentials accept arbitrary email/name values. They are suitable only while frontend and backend listen on loopback. They are not family authentication and must never be used on a LAN, Tailscale, or public listener.

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
