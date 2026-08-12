# Private iOS login over Tailscale

This deployment keeps Wardrowbe, FastAPI, and Dex on loopback. Tailscale Serve
publishes only two private HTTPS origins to devices in the same tailnet.

## First setup

Docker Desktop, Tailscale, PostgreSQL, Redis, and the existing Wardrowbe app
environment must already be available on the Mac.

```bash
WARDROWBE_GENERATE_PASSWORD=1 ./deploy/tailscale-oidc/setup.sh
./deploy/tailscale-oidc/wardrowbe.sh start
./deploy/tailscale-oidc/check.sh
```

The generated Email-login password is copied to the Mac clipboard. It is never
printed or written to disk. Without `WARDROWBE_GENERATE_PASSWORD=1`, setup asks
for a password interactively.

In the official iOS app, enter exactly:

```text
https://g7x9r272rq.tail37713f.ts.net:8445
```

Do not append `/api/v1`; the app adds its API path.

## Login choices

Dex shows two choices:

- **Tailscale** uses the identity of the tailnet member opening the page.
- **Email** uses the local email and password created during setup.

Both methods must use the same email address. Wardrowbe then links both verified
OIDC identities to one internal user and one wardrobe.

## Operations

```bash
./deploy/tailscale-oidc/wardrowbe.sh status
./deploy/tailscale-oidc/check.sh
./deploy/tailscale-oidc/wardrowbe.sh restart
./deploy/tailscale-oidc/wardrowbe.sh stop
```

Generated secrets, the password hash, logs, and PID files live in the ignored,
mode-700 `deploy/tailscale-oidc/runtime/` directory. The Dex database lives in
the Docker volume `wardrowbe-tailscale-oidc_dex-data`.

Back up both the runtime directory and Dex volume while Wardrowbe and Dex are
stopped. Protect the backup like a password database. Test restoring it before
depending on it.

To rotate the local password or generated OIDC/session secrets, stop
Wardrowbe and Dex, back up the runtime directory and Dex volume, move the old
runtime directory to protected storage, then run first setup again. The setup
refuses an existing Wardrowbe database whose user email does not match the
current Tailscale login.

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
