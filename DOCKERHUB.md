# Tasks.md

A self-hosted Markdown kanban with team accounts, live collaboration and activity history.

The image is generic: users, administrator roles, passwords and workspace branding are
private runtime configuration. Every card is continuously exported as Markdown.

[GitHub](https://github.com/yhzhu99/Tasks.md) · [Setup and deployment](https://github.com/yhzhu99/Tasks.md/blob/main/README.md)

## Features

- Nested boards and lanes; People, Review and Done views
- Collaborative Markdown source editing with Yjs + CodeMirror, preview and image upload
- Username and password login; first-login password changes
- Administrator user management: create, enable/disable, assign roles and reset passwords
- Activity history with authors, before/after comparisons and card revision restoration
- Download individual `.md` cards or a ZIP containing all Markdown and portable images
- Assignees, tags, due dates, priorities, search, bulk actions and keyboard navigation
- Full-page settings with search, inline member management and compact activity history
- English / 中文 and light/dark themes
- `linux/amd64` and `linux/arm64`

## Quick start

Use the image-only Compose example below; no source checkout or local build is needed.

Save this as `compose.yml`:

```yaml
services:
  tasks.md:
    image: yhzhu99/tasks.md:${IMAGE_TAG:-latest}
    environment:
      TITLE: ${TITLE:-Tasks.md}
      SUPPORT_CONTACT: ${SUPPORT_CONTACT:-}
      PUBLIC_ORIGIN: ${PUBLIC_ORIGIN:-http://localhost:8080}
      COOKIE_SECURE: ${COOKIE_SECURE:-false}
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - tasks:/tasks
      - config:/config
    restart: unless-stopped
volumes:
  tasks:
  config:
```

Create `.env` in the same directory:

```dotenv
TITLE=My workspace
SUPPORT_CONTACT=Email help@example.com for a password reset
PUBLIC_ORIGIN=http://localhost:8080
COOKIE_SECURE=false
```

Then initialize your administrator (replace `admin` with your chosen username):

```bash
docker compose pull
docker compose run --rm tasks.md node manage-users.js init admin
docker compose up -d
```

The initialization command prints a random temporary password for the administrator
username you chose. Sign in with it, choose a new password, and add
other accounts in Settings → Members. There are no built-in users or passwords.
Open <http://localhost:8080>. The named volumes preserve data across container updates.
Public registration is disabled; all members share access to boards and history.
Set `PUBLIC_ORIGIN` to the site's exact HTTPS origin and `COOKIE_SECURE=true` in production.
After changing `.env`, run `docker compose up -d`; there is no need to rebuild.

## Upgrading from 4.x

Version 5 requires accounts and uses SQLite for collaborative state. Before updating
`latest`, stop the old container and back up **both** `/tasks` and `/config`. Keep the
same volume mounts; ensure they are writable by the container user (UID/GID 1000).

Set the environment variables shown above, pull `yhzhu99/tasks.md:5.0.0`, and initialize
your first administrator against the existing config volume:

```bash
docker compose stop
# Back up both mounted data directories or named volumes before continuing.
docker compose pull
docker compose run --rm tasks.md node manage-users.js init admin
docker compose up -d
```

Replace `admin` with your chosen username. Existing Markdown, ordering and tag colors
are imported on the first application start. Sign in with the generated temporary
password, change it, and create members in Settings → Members. If your installation
already has `users.json` and `team.sqlite`, preserve them and skip administrator
initialization.

After migration, edit cards through the app; external Markdown file changes are not
automatically imported. Continue backing up both volumes. To roll back to 4.x, stop
version 5 and restore the **pre-upgrade** backup of both volumes before starting the old
image. This discards work performed after that backup.

## Persistent data

| Mount | Contents |
| --- | --- |
| `/tasks` | Markdown exports with the board/lane folder tree |
| `/config` | Private `users.json`, SQLite collaboration/history/session state, images and styles |

Existing Markdown data is imported on first startup. SQLite then owns collaborative
state; external edits to exported files are not automatically imported. Back up both
volumes. Historical images are retained for revision recovery.

`TITLE` and `SUPPORT_CONTACT` configure the workspace name and password-recovery contact.
`users.json` configures account names and roles; the administration UI writes changes
back to that file. Manual changes require an application restart. Account configuration
and environment secrets must never be included in an image or committed to Git.

[Full documentation and backup instructions](https://github.com/yhzhu99/Tasks.md/blob/main/deploy/README.md)
