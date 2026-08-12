# Security backlog

Source review and a production-dependency audit were run against personal commit `e79cee7`. This file records gates and proposals; it does not claim remediation.

## Public-launch gates

### P0: restore TLS verification for OIDC

`docker-compose.prod.yml` and `k8s/frontend.yaml` set `NODE_TLS_REJECT_UNAUTHORIZED=0`, disabling certificate verification for every Node HTTPS request. Replace this with provider-specific CA trust through `NODE_EXTRA_CA_CERTS` or a publicly trusted certificate. Add an integration test proving an untrusted provider certificate fails while the configured CA succeeds.

### P0: constrain user-configurable outbound requests

Authenticated users can store AI endpoint URLs and notification destinations. Backend HTTP clients follow redirects and do not block loopback, link-local, private, metadata, or Unix-adjacent destinations. AI calls also attach the server-wide `AI_API_KEY` to user-selected endpoints. Before broader access:

- resolve and validate every hop, including redirects;
- reject loopback, link-local, metadata, multicast, and private ranges unless an administrator explicitly allowlists a destination;
- never attach a global credential to a user-owned endpoint;
- separate administrator-managed AI endpoints from user preferences;
- apply the same owned outbound policy to endpoint tests, ntfy, Mattermost, and other webhook-like channels.

### P0: upgrade public web runtime dependencies

`npm audit --omit=dev` reported six production dependency groups: one critical, four high, and one moderate. Current direct versions include Next.js `14.2.35`, NextAuth below `4.24.15`, Sharp below `0.35.0`, and affected PostCSS versions. Some advisories are not reachable in current configuration: there is no Email provider, no Server Action, images are unoptimized, and API proxying does not use Next rewrites. Public exposure still needs:

- NextAuth `4.24.15` or later with OIDC regression tests;
- a supported Next.js release containing current RSC/DoS/SSRF fixes;
- Sharp/libvips and PostCSS upgrades after image and build regression tests;
- a clean production audit or documented, source-verified non-applicability for every remaining high/critical advisory.

### P0: remove default secrets and public data-service binds

Base Compose publishes PostgreSQL and Redis ports and permits default database, API JWT, and NextAuth secrets. Public and family deployments must fail closed when secrets are missing, bind data services only to an internal network or `127.0.0.1`, and expose only the intended HTTPS entry point.

## Before leaving loopback

- Disable development credentials and backend `DEBUG` mode.
- Generate independent high-entropy `NEXTAUTH_SECRET`, backend `SECRET_KEY`, database password, OIDC client secret, and recovery credentials.
- Use Dex or another supported OIDC provider over verified HTTPS.
- Keep Tailscale ACLs as network boundary for family phase.
- Back up PostgreSQL, uploaded images, provider configuration, and provider account data; test restore.
- Set upload/body limits, storage quotas, and reverse-proxy request timeouts.
- Verify rate limiting fails safely when Redis is unavailable and does not trust spoofable forwarding headers.

## Later hardening

- Add per-user storage quotas and idempotency for background jobs.
- Add concurrency limits for AI, image processing, and background removal.
- Review seven-day backend JWT lifetime and revocation behavior.
- Add audit events for login, provider migration, family membership, endpoint changes, and notification destination changes.
- Add security headers and a restrictive Content Security Policy before public hosting.
- Add automated secret scanning, dependency review, SBOM generation, container scanning, and signed release images.
- Define retention and deletion behavior for images, EXIF-derived data, profile measurements, gender context, and family data.

Detailed architecture options live in `security-hardening/hardening.md`.
