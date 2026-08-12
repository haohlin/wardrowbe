# Security Hardening Review: Wardrowbe outbound trust boundaries

## Evidence Basis

I inspected production auth, deployment, AI endpoint, and notification outbound paths at revision `e79cee7`. The evidence is current source plus a production dependency audit, not a sealed scan. The most important structural issue is ambient network authority: one deployment switch disables TLS verification process-wide, while several user-owned URLs reach redirect-following HTTP clients and can inherit server credentials.

## Constraints

We want a very small Mac/Linux deployment, official OIDC integration, Tailscale-only family access first, and a later public release. No latency or memory budget was supplied. Current work should preserve official APIs and avoid adding another service unless public multi-user exposure makes that cost worthwhile.

## Opportunity Portfolio

| Opportunity | Evidence | Options | Recommendation | Proposal |
| --- | --- | --- | --- | --- |
| Own outbound trust and credential policy | Global TLS disable, user AI URLs, user notification URLs (`E-TLS`, `E-AI-OUTBOUND`, `E-NOTIFY-OUTBOUND`) | 1. In-process owned boundary; 2. Egress gateway | Use Option 1 before family exposure; reconsider Option 2 for public multi-tenant launch | [Proposal](proposals/own-outbound-trust.md) |

## Recommendation Summary

I recommend Option 1 under current lightweight constraints: use scoped CA trust, one shared destination validator, redirect revalidation, and credentials bound to administrator-owned destinations. This removes immediate ambient authority without another runtime service. Option 2 becomes preferable when public availability, multiple trust tiers, or stronger containment justify an egress proxy and its operational cost.

Dependency upgrades and secret/bind corrections remain direct launch gates in `../SECURITY_BACKLOG.md`; architecture work does not replace them.

## Next Decisions

- Confirm allowed private AI destinations for Tailscale family phase.
- Choose whether custom AI endpoints remain user-editable or become administrator-managed.
- Select Option 1 before implementation; no proposal here is a completed fix.
