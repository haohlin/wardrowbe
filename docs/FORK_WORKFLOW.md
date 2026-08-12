# Fork workflow

This fork keeps official Wardrowbe history easy to audit and personal changes easy to remove.

## Branch roles

- `upstream/main`: official project.
- `main` and `origin/main`: clean mirror of `upstream/main`; no personal commits.
- `personal` and `origin/personal`: deployable personal branch, rebuilt from current `main` with one feature per commit.
- `archive/personal-v1.4-before-1.7`: immutable rollback point for pre-1.7 personal work.

## Update sequence

1. Stop runtime writes and verify worktree is clean.
2. Fetch `upstream` and `origin`.
3. Fast-forward `main` from `upstream/main`; never merge `personal` into `main`.
4. Rebase or rebuild `personal` on new `main`.
5. Reapply only features still absent upstream. Prefer official models, APIs, migrations, and UI patterns.
6. Keep each feature or compatibility fix in one tested commit.
7. Run backend tests, frontend tests, i18n checks, production build, migration checks, and a runtime smoke test.
8. Push `main` first, then `personal`.

## Current personal commit order

1. Image compatibility: HEIC/octet-stream and EXIF orientation.
2. Modern AI completion API compatibility.
3. Separate onboarding library and camera inputs.
4. Per-image bulk upload metadata.
5. Optional gender profile context.
6. Persistent AI task banner.
7. Suggestion preference and refinement.
8. Suitable saved-outfit reuse.
9. Session no-repeat exclusions.

If upstream later implements one of these features, drop the matching personal commit during the next rebuild instead of layering another compatibility shim.

## Database rule

Never reset a user database to solve migration drift. Back up first, inspect `alembic_version` and schema, then advance through official migrations. Personal migrations must be nullable or otherwise backward-compatible and must support downgrade testing on the disposable test database.
