# Tasks.md

A self-hosted Markdown kanban with team accounts, live collaboration and activity history.

The image is generic: users, administrator roles, passwords and workspace branding are
private runtime configuration. Every card is continuously exported as Markdown.

[GitHub](https://github.com/yhzhu99/Tasks.md) · [Setup and deployment](https://github.com/yhzhu99/Tasks.md/blob/main/README.md)

## Features

- Nested boards and lanes; People, Review and Done views
- Collaborative Markdown source editing with Yjs + CodeMirror, preview and image upload
- Personal accounts behind a shared team key; first-login password changes
- Administrator user management: create, enable/disable, assign roles and reset passwords
- Activity history with authors, before/after comparisons and card revision restoration
- Download individual `.md` cards or a ZIP containing all Markdown and portable images
- Assignees, tags, due dates, priorities, search, bulk actions and keyboard navigation
- English / 中文 and light/dark themes
- `linux/amd64` and `linux/arm64`

## Quick start

Copy the repository's `.env.example` and Compose file. Set a private `TEAM_KEY`, then:

```bash
mkdir -p tasks config
docker compose run --rm tasks.md node manage-users.js init admin
docker compose up -d
```

The initialization command prints a random temporary password for the administrator
username you chose. Sign in with it and your team key, choose a new password, and add
other accounts in Settings → User management. There are no built-in users or passwords.
Ensure the volume directories are writable by the container UID/GID (default 1000).
Set `PUBLIC_ORIGIN` to the site's exact HTTPS origin and `COOKIE_SECURE=true` in production.

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
