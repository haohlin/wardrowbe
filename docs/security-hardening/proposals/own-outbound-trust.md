# Security Hardening Proposal: Own outbound destination, TLS, and credential policy

## Decision

Choose where Wardrowbe should enforce trust for OIDC, AI, and notification HTTP traffic before family or public exposure.

## Executive Recommendation

Option 1, **Owned in-process outbound boundary**, keeps one small deployment and moves destination, redirect, TLS, and credential checks behind shared application APIs. Option 2, **Dedicated outbound egress gateway**, adds process and network isolation so application code cannot bypass policy. I recommend Option 1 for the Tailscale family phase. Option 2 should win for public multi-user hosting if user-owned destinations remain a product feature.

## Evidence

I inspected the callers and deployment manifests listed below. They show an ownership problem rather than one isolated URL check.

| Evidence | Finding or document | What it establishes |
| --- | --- | --- |
| `E-TLS` | Global Node TLS verification disabled | `docker-compose.prod.yml` and `k8s/frontend.yaml` set `NODE_TLS_REJECT_UNAUTHORIZED=0`. |
| `E-AI-OUTBOUND` | User AI URLs receive server authority | `backend/app/services/ai_service.py` follows redirects and builds Authorization from the server-wide AI key. |
| `E-NOTIFY-OUTBOUND` | User notification URLs reach network clients | `backend/app/services/notification_providers.py` follows redirects; schemas validate syntax, not resolved address classes. |
| `E-AUTH` | Scoped OIDC controls already exist | `frontend/lib/auth.ts` enables PKCE/state; `backend/app/utils/oidc.py` supports a CA bundle and verifies ID-token issuer, audience, signature, and expiry. |

Observed claims above come directly from source. We infer that dispersed caller ownership makes control drift likely: fixing one provider cannot prove another provider, its redirect, or a later caller uses the same policy.

## Current Design And Failure Mode

Browser users can configure outbound destinations after authentication. Individual services build HTTP clients, often with redirects enabled. DNS resolution and redirect destinations are delegated to libraries without a shared block for loopback, link-local, metadata, or private ranges. AI calls can add an ambient global credential. Separately, frontend production deployment weakens TLS for the entire Node process to accommodate a private OIDC certificate.

This means a compromised or malicious account may turn application reachability into an internal-network probe or credential sink. Tailscale reduces who can attempt this during family phase, but it does not make an authenticated destination trustworthy. Global TLS disabling also affects connections unrelated to OIDC.

## Desired Invariants

- Every HTTPS connection verifies a trusted chain; private CAs are scoped, not process-wide bypasses.
- Every original destination and redirect hop is resolved and checked before connection.
- Loopback, link-local, metadata, multicast, and private ranges are denied unless an administrator allowlists the exact service.
- Server credentials are bound to administrator-owned destinations and never follow a user-selected URL.
- Policy rejections are observable without logging tokens, credentials, or sensitive URL components.

## Constraints And Non-Goals

We preserve official OIDC and provider APIs, support a weak Linux server, and avoid a new service for private testing unless required. This proposal does not select Dex, redesign user authorization, upgrade dependencies, or claim public readiness. Dependency and secret fixes remain separate tactical gates.

## Before Architecture

[Before diagram](../diagrams/own-outbound-trust-before.mmd)

Current callers independently decide where and how to connect. The important edge is the direct path from user-owned configuration to network clients that hold server reachability or credentials.

## Options

### Option 1: Owned in-process outbound boundary

We introduce one destination-policy module and client factory used by endpoint tests, AI calls, ntfy, Mattermost, and future webhook-like providers. It parses only HTTP(S), rejects credentials in URLs, resolves all A/AAAA results, checks every address, connects without automatic redirects, then repeats validation for each bounded redirect. Administrator configuration supplies narrowly scoped private-destination exceptions and credential bindings.

For OIDC, we remove `NODE_TLS_REJECT_UNAUTHORIZED=0` and mount the provider CA through standard Node trust configuration. Publicly trusted certificates need no extra CA. Backend discovery already has a scoped CA-bundle mechanism, so we preserve that official path.

[Option 1 diagram](../diagrams/own-outbound-trust-owned-in-process-boundary-after.mmd)

| Change | Before | After | Security consequence | Cost |
| --- | --- | --- | --- | --- |
| Destination validation | Per caller, syntax-focused | Shared resolved-address and redirect policy | Known SSRF routes fail closed | DNS and compatibility tests |
| AI credentials | Global key follows selected endpoint | Credential bound to administrator endpoint | User URL cannot receive ambient key | Configuration migration |
| OIDC trust | Global TLS verification disabled | Scoped CA or public PKI | Other Node HTTPS stays verified | CA mounting and renewal |
| Deployment | Existing processes | Existing processes | No new isolation boundary | Lowest memory/operations cost |

Strongest case: this option directly fixes current paths with small runtime cost and matches weak-server constraints. What gives me pause is bypass risk: a future developer can instantiate `httpx` directly. Static checks, code review ownership, and tests reduce this but cannot equal network isolation. Rollback can restore individual clients, but global TLS verification should remain enabled even during rollback.

### Option 2: Dedicated outbound egress gateway

We keep Option 1 validation at API boundaries, then deny sensitive direct egress from backend/worker networks. A small gateway owns allowlists, DNS/redirect checks, TLS policy, and destination-specific credentials. Application callers submit an operation and destination identity, not arbitrary headers or ambient secrets.

[Option 2 diagram](../diagrams/own-outbound-trust-egress-gateway-after.mmd)

| Change | Before | After | Security consequence | Cost |
| --- | --- | --- | --- | --- |
| Enforcement | Application convention | Application plus network boundary | Direct bypass is contained | New privileged service |
| Credentials | Backend environment | Gateway secret scope | Backend compromise exposes fewer outbound keys | Secret migration |
| Failure | Per-provider call failure | Shared gateway dependency | Better containment, larger shared outage domain | Health/retry/runbook work |
| Resources | No extra process | Gateway and connection pools | Stronger public boundary | More RAM, CPU, and latency |

This is attractive when untrusted public users can configure destinations, because compromised application code cannot silently recover direct network authority. It also centralizes observability. The price is material on a weak server: another process, hop, policy store, and failure mode. Rollout should canary one notification provider, then AI, and enforce default-deny egress only after direct-egress telemetry is quiet. Rollback restores routing while leaving application validation active.

## Comparison

| Dimension | Option 1: In-process | Option 2: Gateway |
| --- | --- | --- |
| Security | Fixes known paths; convention can drift | Strong containment; gateway becomes privileged |
| Performance | DNS/check overhead only | Extra hop and possible buffering |
| Memory | Small policy state | Additional process and pools |
| Reliability | Few new moving parts | Shared dependency, stronger isolation |
| Operability | Allowlist and logs in current services | Deployment, health, metrics, policy lifecycle |
| Migration | Incremental by caller | Caller plus network-policy migration |

Option 1 fits current constraints. Option 2 becomes proportionate when public user count, compliance, or destination flexibility makes bypass impact more important than resource and operational simplicity.

## Recommendation

I recommend Option 1 before any family listener leaves loopback. We can validate intended Tailscale/private AI hosts explicitly while keeping OIDC and deployment small. Before public launch, we should revisit Option 2 with measured weak-server memory and latency plus a firm decision on whether ordinary users may configure destinations.

## Evidence Coverage And Residual Risk

| Evidence | Option 1 | Option 2 | Tactical work still required |
| --- | --- | --- | --- |
| `E-TLS` — Global Node TLS disable | Addresses | Addresses frontend separately | Remove flag; install scoped CA; negative TLS tests |
| `E-AI-OUTBOUND` — AI URL and key authority | Addresses known callers | Addresses and contains bypass | Separate admin endpoints and credentials |
| `E-NOTIFY-OUTBOUND` — Notification destinations | Mitigates all integrated providers | Addresses through default-deny egress | Provider-specific tests and allowlists |
| `E-AUTH` — Existing OIDC verification | Preserved | Preserved | Keep PKCE/state and backend token tests |

Neither option fixes dependency advisories, weak default secrets, exposed Compose ports, upload abuse, or token revocation. A compromised allowed destination remains trusted until removed.

## Migration And Rollout

Start with an inventory of required destinations and current private address use. Add scoped CA trust and tests. Introduce destination policy in report-only mode, then enforce it for endpoint tests, notifications, and AI calls. Split global AI credentials from user preferences before enabling private exceptions. For Option 2, canary the gateway after Option 1 and enforce network denial last.

## Validation Plan

- Reject IPv4/IPv6 loopback, link-local, metadata, multicast, and private targets by default.
- Reject hostnames resolving to any forbidden address and redirects into forbidden space.
- Exercise DNS answer changes between validation and connect; use a connect path bound to validated results or equivalent library support.
- Prove an untrusted OIDC certificate fails and configured CA succeeds.
- Capture a mock user endpoint and prove no global AI key arrives.
- Test expected local Ollama/Tailscale hosts through explicit admin policy.
- Measure p50/p95 connection setup and peak RSS on target weak server.

## Implementation Work Packages

- Destination and redirect policy with address-class tests.
- Scoped TLS/CA configuration for frontend and backend.
- Administrator-owned endpoint and credential model.
- AI, endpoint-test, ntfy, and Mattermost client migration.
- Safe rejection telemetry and deployment documentation.
- Optional egress gateway and network policy after renewed decision.

## Open Questions

- Which private hosts and ports are required for local AI?
- May public users ever add custom AI or notification destinations?
- What peak RSS and added latency are acceptable on target server?
- Can family OIDC use a publicly trusted certificate, removing private CA distribution?
