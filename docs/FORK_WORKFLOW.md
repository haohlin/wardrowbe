# Fork Workflow (haohlin/wardrowbe)

This is a **fork** of [`Anyesh/wardrowbe`](https://github.com/Anyesh/wardrowbe). This file
documents how we develop, run locally, stay in sync with upstream, and contribute back.
It lives only on our fork (never include it in an upstream PR).

## Remotes

| Remote | URL | Use |
|--------|-----|-----|
| `origin` | git@github.com:haohlin/wardrowbe.git | **Our fork** — push everything here |
| `upstream` | https://github.com/Anyesh/wardrowbe.git | **Read-only** — pull/fetch only, never push |

`git config` in this repo: `remote.pushDefault=origin`, `push.autoSetupRemote=true`
(new branches push to the fork automatically).

## Branches

| Branch | Role | Rule |
|--------|------|------|
| `main` | Clean mirror of `upstream/main` | Never commit directly. Only fast-forward from upstream. Tracks `upstream/main`. |
| `personal` | Our long-lived **deploy / daily-use** branch | Carries ALL our work, including personal-only tooling. This is what we run/self-host. |
| `feat/ai-suggestion-flow` | Pristine pre-rebase backup (7 original commits) | Safety net. Leave as-is. |
| `feat/*` (topic branches) | One clean feature each, cut from `main` | Source of upstream PRs. No personal tooling, no dead code, no known bugs. |

Backup tag: `backup/pre-rebase-main-20260710` (pre-rebase state of the old local main).

## Daily development

```bash
# Work on the deploy branch (or a feature branch off it)
git switch personal
# ...edit...
git add -A && git commit -m "..."
git push            # -> origin/personal (fork)
```

## Local test & run

```bash
# Backend (FastAPI) on :8000
cd backend && ../.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Worker (async AI tasks: tagging, suggestions) — required for AI features
cd backend && ../.venv/bin/arq app.workers.worker.WorkerSettings

# Frontend (Next.js) on :3000
cd frontend && npm run dev

# Login: DEV_MODE=true — log in as dev@wardrobe.local (owns all local data)

# Tests
cd backend && TEST_DATABASE_URL=postgresql+asyncpg://wardrobe:wardrobe@localhost:5432/wardrobe_test ../.venv/bin/python -m pytest -q
cd frontend && npm test -- --run
```

Data lives in local Postgres (`wardrobe` DB) + `.data/` (both git-ignored) — safe from all git ops.

## Sync with upstream (do this periodically)

```bash
git fetch upstream
git switch main && git merge --ff-only upstream/main   # advance the mirror
git push origin main                                   # keep the fork's main current
git switch personal && git rebase upstream/main        # replay our work on top
# resolve conflicts, run tests, then:
git push --force-with-lease                            # update origin/personal
```

## Contributing back (Pull Request to upstream)

Keep PRs small and focused — one coherent feature, no personal tooling, no dead code.

```bash
git fetch upstream
git switch -c feat/<feature-name> upstream/main        # fresh branch off latest upstream
# bring in ONLY that feature's changes (cherry-pick, or hand-pick files)
git push -u origin feat/<feature-name>                 # push to our fork
gh pr create --repo Anyesh/wardrowbe --base main --head haohlin:feat/<feature-name>
```

### Good first PR candidates (from the branch audit)
- Upload robustness: EXIF orientation + HEIC/`octet-stream` MIME handling
- gpt-5.x request compatibility (`max_completion_tokens`, drop temp/logprobs)
- AI field-mapping normalization
- Bilingual EN/中文 i18n (as a proper `t()`-only system — drop the DOM-mutation bridge first)
- `/suggest/auto` flow + try-another combo exclusion
- Gender profile field

### Do NOT upstream (personal-only, keep on `personal`)
- `scripts/verify_wardrowbe_preview.py`, `Makefile`, `preview-guard.yml`, `test_preview_guard.py`, the pre-commit hook
- This `docs/FORK_WORKFLOW.md`

### Fix before any PR
- `_debug_prompt` PII persisted to DB unconditionally (gate on `settings.debug` at write)
- Try-on image generation firing in the scheduled worker (make opt-in / skip in worker)
- `bg_removal_model` default (`u2net` vs Gemini id mismatch with default provider)
