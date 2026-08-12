# Hardening evidence context

- Source root: `/Users/haohanl/dev/wardrowbe`
- Reviewed revision: `e79cee7bd2af95afd385a1c85c32e050fdfbf8e0`
- Evidence collection SHA-256: `767cfb53cb525a9ec3bb0e9fdf412ab3e0b16c5ba3a9d7343ac9aab4a1937200`
- Source drift during review: none; later changes are derived documentation only.

| Evidence | Title | Source |
| --- | --- | --- |
| `E-TLS` | Global Node TLS verification disabled | `docker-compose.prod.yml`, `k8s/frontend.yaml` |
| `E-AI-OUTBOUND` | User AI URLs receive server outbound authority | `backend/app/schemas/preference.py`, `backend/app/services/ai_service.py`, `backend/app/api/preferences.py` |
| `E-NOTIFY-OUTBOUND` | User notification destinations reach redirect-following clients | `backend/app/schemas/notification.py`, `backend/app/services/notification_providers.py` |
| `E-AUTH` | OIDC verification controls already present | `frontend/lib/auth.ts`, `backend/app/utils/oidc.py`, `backend/app/api/auth.py` |
| `E-DEPS` | Production dependency audit reports high and critical advisories | `frontend/package-lock.json`; `npm audit --omit=dev`, 2026-08-12 |

No canonical Codex Security scan artifacts were present in the repository. This analysis uses current source and dependency-audit evidence; it is not a sealed scan report.
