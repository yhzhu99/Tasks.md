# Deploy behind an existing Docker reverse proxy

The application image contains no users, administrator assignments or credentials.
Keep deployment data and secrets outside the source checkout.

```text
/opt/tasks-md/
  source/               # this repository, excluding private files
  docker-compose.yml    # copy of deploy/compose.yml
  .env                  # private runtime configuration, mode 600
  backup.sh             # copy of deploy/backup.sh
  data/tasks/           # initial import, then Markdown exports
  data/config/          # users.json, team.sqlite, images and styles
  backups/
```

In the private `.env`, set `PUBLIC_ORIGIN`, `TITLE`, `SUPPORT_CONTACT`,
`PROXY_NETWORK` (the existing proxy's Docker network) and optionally `IMAGE_TAG`.
Set `PUID` and `PGID` to the owner of the data volumes; the default is 1000.
`users.json` must be writable because account and password changes update it.

```bash
mkdir -p data/tasks data/config backups
# Set ownership to match the configured container UID/GID.
docker compose build
docker compose run --rm tasks node manage-users.js init admin
docker compose up -d
```

For an existing installation, copy both `tasks/` and `config/` into `data/` before
first startup. Keep a separate, unmodified backup. No old operation authors can be
reconstructed: migration creates an initial history snapshot. Do not write to the
old installation after the final copy. This is a one-way cutover, not bidirectional
NAS synchronization.

Caddy site block (replace the domain):

```caddyfile
tasks.example.com {
    encode gzip zstd
    reverse_proxy tasks-md:8080 {
        flush_interval -1
    }
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options nosniff
        Referrer-Policy same-origin
        -Server
    }
}
```

Create an A record pointing the domain to the server. DNS-only is supported;
Caddy obtains and renews the HTTPS certificate. The application publishes no host
port. Enable proxying in Cloudflare later only with SSL/TLS set to Full (strict).
Validate Caddy configuration before applying it. Reload through the admin API when
available; older Caddy versions with `admin off` need a short proxy restart.

## Backups and recovery

`backup.sh` makes an online SQLite snapshot and reconstructs Markdown exports and
hashed account config from that same snapshot. It includes images and styles, strips
sessions from the backup, compresses it, and retains 30 days. It does not stop the app.
The host `.env` is a separate secret: back it up privately as well. Copy archives to
another machine for protection against server loss.

```bash
./backup.sh
# Example root crontab: 30 3 * * * cd /opt/tasks-md && ./backup.sh >> /var/log/tasks-md-backup.log 2>&1
```

To restore: stop only `tasks`, move the current `data/` aside, extract a snapshot,
copy its `tasks/` and `config/` into `data/`, restore their UID/GID ownership, and start
`tasks` again. Restore the entire snapshot, not just Markdown, to preserve histories,
user identities and collaboration state. Restored users must sign in again.

Administrator recovery:

```bash
docker compose exec -T tasks node manage-users.js reset admin
docker compose restart tasks
```

The CLI changes private config, invalidates sessions, and prints a temporary password.
Restart is required to reload the config. Normal account creation, role changes,
enabling/disabling and password resets are available in Settings → Members.

## Validation

Run `npm test` and `npm run build`. The Docker build also runs backend behavior tests.
Tests cover authentication, forced password changes, session revocation, administrator
boundaries, configuration persistence, last-administrator protection, stale writes,
real Yjs provider collaboration and awareness, rename during editing, history,
restoration, export with portable image paths, and server restart.

For a release, use two separate browser profiles to edit one card simultaneously,
check the saved indicators, and compare the downloaded `.md` files. Verify direct card
links, Chinese paths, user management, narrow screens, and HTTPS/WebSocket access.
