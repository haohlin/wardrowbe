# Private iOS login over Tailscale

This deployment keeps Wardrowbe, FastAPI, and Dex on loopback. Tailscale Serve
publishes only two private HTTPS origins to devices in the same tailnet.

## First setup

A running local Docker engine (Colima or Docker Desktop), Tailscale, PostgreSQL,
Redis, and the existing Wardrowbe app environment must already be available on
the Mac.

```bash
WARDROWBE_GENERATE_PASSWORD=1 ./deploy/tailscale-oidc/setup.sh
./deploy/tailscale-oidc/wardrowbe.sh start
./deploy/tailscale-oidc/check.sh
```

The generated Email-login password is copied to the Mac clipboard. It is never
printed or written to disk. Without `WARDROWBE_GENERATE_PASSWORD=1`, setup asks
for a password interactively.

If the populated Wardrowbe account still uses an older development email,
setup refuses to split it from the Tailscale identity. When exactly one account
owns wardrobe items, explicitly migrate that account and retain a private
rollback record with:

```bash
WARDROWBE_MIGRATE_OWNER_EMAIL=1 WARDROWBE_GENERATE_PASSWORD=1 \
  ./deploy/tailscale-oidc/setup.sh
```

The migration changes that account's email to the Tailscale login and sets
`email_verified = true` in the same statement, because Wardrowbe joins a Dex
sign-in to an existing account only when the account's email is verified.
Running it is the owner vouching that the Tailscale login address belongs to
that account. It needs the `email_verified` column, so run it only on a database
that is already at `alembic upgrade head`.

The rollback record `runtime/owner-email-before-migration` holds `USER_ID`,
`PREVIOUS_EMAIL`, and `PREVIOUS_EMAIL_VERIFIED`. To undo the migration, stop
Wardrowbe and write both recorded values back:

```sql
UPDATE users SET email = '<PREVIOUS_EMAIL>', email_verified = <PREVIOUS_EMAIL_VERIFIED>
WHERE id = '<USER_ID>';
```

In the official iOS app, enter exactly:

```text
https://<tailnet-host>:8445
```

`<tailnet-host>` is this Mac's Tailscale DNS name. `setup.sh` reads it from
`tailscale status` and stores it as `TAILSCALE_DNS_NAME` in
`runtime/wardrowbe.env`. Do not append `/api/v1`; the app adds its API path.

## Login choices

Dex shows two choices:

- **Tailscale** uses the identity of the tailnet member opening the page.
- **Email** uses the local email and password created during setup.

Both methods must use the same email address, so both reach the same Wardrowbe
account and wardrobe. Dex gives each method its own subject, and an account
holds one OIDC identity at a time, so the two methods take turns: signing in
with one ends the sessions that were started with the other. Use the same method
on the Mac browser and on the iPhone to keep both signed in.

## Operations

```bash
./deploy/tailscale-oidc/wardrowbe.sh status
./deploy/tailscale-oidc/check.sh
./deploy/tailscale-oidc/wardrowbe.sh restart
./deploy/tailscale-oidc/wardrowbe.sh stop
```

Generated secrets, the password hash, logs, and any migration rollback record
live in the ignored, mode-700 `deploy/tailscale-oidc/runtime/` directory. The
four Wardrowbe processes (`backend`, `worker`, `image-worker`, `frontend`) run
as scoped macOS launchd jobs. The image worker serves the `arq:images` queue,
which carries image rotation and background removal. The Dex database lives in
the Docker volume `wardrowbe-tailscale-oidc_dex-data`.

Back up both the runtime directory and Dex volume while Wardrowbe and Dex are
stopped. Protect the backup like a password database. Test restoring it before
depending on it.

To rotate the local password or generated OIDC/session secrets, stop
Wardrowbe and Dex, back up the runtime directory and Dex volume, move the old
runtime directory to protected storage, then run first setup again. The setup
refuses an existing Wardrowbe database whose user email does not match the
current Tailscale login.

## Upgrading across upstream releases

The scripts never run database migrations. When the checkout moves to a newer
upstream release, upgrade by hand in this order:

1. Stop all four processes with `./deploy/tailscale-oidc/wardrowbe.sh stop`,
   then switch the checkout to the new release. The old backend must not serve
   once the migration has run; see `docs/sign-in-identities.md`.
2. Back up the database and keep the file. Put the UTC time in its name, because
   the identity repair SQL in `docs/sign-in-identities.md` needs it. Take the
   connection values from `DATABASE_URL` in `backend/.env`, with the scheme
   written as `postgresql://`:

   ```bash
   pg_dump --dbname="postgresql://<user>@127.0.0.1:5432/<database>" \
     > backup-$(date -u +%Y%m%dT%H%M%SZ).sql
   ```

3. Check that every stored email is already lowercase and trimmed. The count
   must be 0; correct any such row before continuing:

   ```sql
   SELECT count(*) FROM users WHERE email <> lower(btrim(email));
   ```

   Sign-in looks an account up by the exact normalised address. A stored email
   that differs is not found when a Dex method the account has not used yet
   signs in, and that sign-in gets a new, empty account.
4. Run the migrations from `backend/`, which reads `backend/.env`:

   ```bash
   cd backend && ../.venv/bin/alembic upgrade head
   ```

5. Start again with `./deploy/tailscale-oidc/wardrowbe.sh start`, then run
   `./deploy/tailscale-oidc/check.sh`.
6. Sign in once on each client that was signed in before the upgrade to upstream
   v1.13 (sign-in identities). API tokens issued by the earlier fork build are
   not bound to a sign-in identity and are refused.

Use the same Dex login method on the Mac browser and on the iPhone. One account
holds one OIDC identity at a time, so a sign-in through the other method ends
the sessions started with the first (see Login choices).

## Rollback

Stop the managed Wardrowbe processes and Dex:

```bash
./deploy/tailscale-oidc/wardrowbe.sh stop
docker compose -f deploy/tailscale-oidc/compose.yaml down
```

Remove only the two Wardrowbe Serve handlers if they are no longer wanted:

```bash
tailscale serve --https=8445 off
tailscale serve --https=8446 off
```

Do not run `tailscale serve reset`; other services use separate Serve ports.
`docker compose down` retains the Dex data volume unless `--volumes` is added.
