# ![logo](public/logo.png) Tasks.md

A self-hosted, Markdown file based task management board.

Write Markdown together with authenticated accounts, live collaboration and activity history.
Every card is continuously exported as a `.md` file; download individual cards or a ZIP
with the complete folder tree and images from Settings.

The Docker image is generic: account names, administrators, passwords and workspace
branding are private runtime configuration, never compiled into the image.

## ⭐ Features

- **Team accounts** — team-key gate, personal login, first-login password change,
  administrator user management and password recovery;
- **Live Markdown collaboration** — Yjs + CodeMirror, remote cursors, explicit saved
  status and local recovery drafts;
- **Activity history** — author, timestamp, before/after comparison, filters and
  administrator restoration of card revisions, including deleted cards;

- **Nested boards** — organize work as `Project → Board → Lane` (infinitely
  nestable). Child boards sit in a strip above the columns; lanes only hold
  cards. Navigate with the sidebar, breadcrumbs and clicks;
- **People view** — a global page with everyone's TODOs, grouped by assignee
  across all boards, sorted by due date;
- **Priority TODO** — mark any card as priority (★ badge) right where it
  sits: no separate column, no moving. One click on the card's ★ (or press
  `p` on a focused card) toggles it; priority cards stay in their lane,
  float to the top with the "Priority first" sort, and the badge is one
  click to remove;
- **Review & done** — mark a card for acceptance (highlighted, with timestamp)
  then complete it. A Review view lists the whole queue; completed cards stay
  in the lane, greyed out, and also appear in the Done view;
- Cards support **assignees, tags and due dates** written as plain Markdown
  tokens (`[person:Jane]`, `[tag:urgent]`, `[due:2026-01-31]`). Workflow
  tokens — `[review:]`, `[done:]`, `[prio:]` — are managed by the UI and
  stay hidden from card previews;
- Lightweight **Markdown editor** (write/preview) with image upload and
  sanitized rendering — no rich text editor dependency;
- Search, tag filtering, manual & automatic sorting, bulk operations
  (add/remove tags, set due date, delete);
- Keyboard-first navigation, vim style (see
  [KEYBOARD_SHORTCUTS.md](KEYBOARD_SHORTCUTS.md));
- Light and dark themes synced with OS settings, with 3 default color themes
  (Adwaita, Nord, Catppuccin) and full CSS customization;
- Single Docker image, PWA support, subpath based reverse-proxy support;
- English / 中文 (switch in Settings).

## 📁 Data model

On first startup, existing task folders are imported into `CONFIG_DIR/team.sqlite`.
SQLite then owns resource identities, Yjs state, history and sessions. Markdown files
are a continuously maintained export, with the same layout as before:

| Concept   | On disk                                          |
| --------- | ------------------------------------------------ |
| Board     | any directory (`TASKS_DIR` root is *Home*)       |
| Lane      | a directory that contains `.md` files directly   |
| Child board | a directory marked as a board (`.board`) or that only contains directories |
| Card      | a `.md` file — filename is the title, body is the content |

Because the rule is purely structural, nesting is unlimited: a project can
contain boards, which contain boards, which contain lanes.

Example:

```
tasks/                  <- Home
├── Website/            <- a Project (no direct cards)
│   ├── Backlog/        <- a Board (no direct cards either)
│   │   └── Design/     <- a Lane (contains .md directly)
│   │       └── Redo homepage.md
│   └── Sprint/         <- another Board
│       └── Todo/
│           └── Fix login.md
└── Ops/                <- a Board with its own lanes
    ├── Doing/
    │   └── Renew certs.md
    └── Done/
```

Card content can carry metadata tokens, rendered as chips in the UI:

```markdown
[person:Jane] [tag:urgent] Fix login bug

[due:2026-01-31]

Steps to reproduce...
```

Do not edit or synchronize files back into `TASKS_DIR` after migration: external
file edits are not imported automatically into active collaborative documents.
Back up both directories, including `team.sqlite` and `users.json`. Historical images
are retained so restoring old content does not produce broken images.

Tag colors, lane ordering and uploaded images are kept in `CONFIG_DIR`
(`tags.json`, `sort.json`, `images/`). Names starting with a dot are hidden.
Avoid creating a board named `_people` (People view), `_done` (completed
archive) or `_api`.

## 🐋 Installation

### Docker Compose

```bash
cp .env.example .env
# Edit .env: choose a private TEAM_KEY. Use your HTTPS origin and
# COOKIE_SECURE=true behind a production reverse proxy.
mkdir -p tasks config
docker compose build
docker compose run --rm tasks.md node manage-users.js init admin
docker compose up -d
```

The initialization command prints a random temporary administrator password. Sign in
with that username, the temporary password and your team key. Change the password on
first login, then create the remaining accounts in **Settings → User management**.

The container runs as UID/GID 1000 by default. Existing volume directories must be
writable by that user; set `PUID`/`PGID` in Compose to match their host ownership.
The example binds port 8080 only on localhost. For a public HTTPS deployment using an
existing proxy, see [deploy/README.md](deploy/README.md).

Runtime configuration:

| Setting | Purpose |
| --- | --- |
| `TEAM_KEY` | Required shared gate, supplied as an environment variable |
| `CONFIG_DIR/users.json` | Private account configuration, including roles and password hashes |
| `USERS_FILE` | Optional alternative path to the writable user configuration |
| `TITLE` | Workspace name on the login page and Home board; default `Tasks.md` |
| `SUPPORT_CONTACT` | Contact instructions shown under “Forgot password” |
| `PUBLIC_ORIGIN` | Exact browser origin, e.g. `https://tasks.example.com` |
| `COOKIE_SECURE` | Defaults to `true`; use `false` only for local HTTP development |
| `TASKS_DIR` / `CONFIG_DIR` | Markdown exports and private application data |
| `BASE_PATH` | Optional subpath; also supply `--build-arg BASE_PATH=/tasks/` when building |

`users.json` is loaded at startup and updated by user management. Manual edits require
an application restart. It must contain at least one enabled administrator. Removing
an account from the file disables its database account and revokes its sessions;
history remains available. Never commit this file. Bootstrap configuration may use
`initialPassword` (at least eight characters); startup replaces it with `passwordHash`
and forces the user to choose a new password. There are no built-in users or passwords.

To recover an administrator who cannot sign in:

```bash
docker compose exec tasks.md node manage-users.js reset admin
docker compose restart tasks.md
```

The command invalidates existing sessions and prints a new temporary password.
Normal member resets are available to administrators in Settings.

## 💻 Run from source

Requires [Node.js 24 LTS](https://nodejs.org/). With [fnm](https://github.com/Schniz/fnm):

```bash
fnm install   # installs the version from .node-version
fnm use       # activates it in this shell
npm run setup
CONFIG_DIR=./config node backend/manage-users.js init admin
export TEAM_KEY="your-development-team-key" COOKIE_SECURE=false
npm run dev
```

That single command installs every dependency and starts the whole stack:

- API on <http://localhost:8080>
- App with hot reload on <http://localhost:3000>

Data lives in `./tasks` and `./config` (created automatically).

Other scripts:

| Command         | What it does                                                          |
| --------------- | --------------------------------------------------------------------- |
| `npm run dev`   | install (if needed) + run API and Vite dev server concurrently        |
| `npm start`     | production build, then serve app + API on <http://localhost:8080>     |
| `npm test` | run API, authentication, collaboration and persistence regressions |
| `npm run build` | build the frontend into `frontend/dist`                               |
| `npm run setup` | (re)install root, backend and frontend dependencies                   |

## 🚀 Build & publish the Docker image

The `yhzhu99/tasks.md` image is built and published automatically: push a git
tag (e.g. `v4.1.2`) and GitHub Actions builds multi-arch images
(`linux/amd64`, `linux/arm64`) and pushes `4.1.2`, `4.1`, `4`
and `latest` to Docker Hub.

This needs two repository secrets (GitHub → Settings → Secrets and variables
→ Actions):

- `DOCKER_USERNAME` → `yhzhu99`
- `DOCKER_PASSWORD` → a Docker Hub [personal access token](https://docs.docker.com/security/for-developers/access-tokens/) with Read & Write

```bash
git tag v4.1.2 && git push origin v4.1.2
```

To build and push locally instead:

```bash
docker login -u yhzhu99
DOCKER_BUILDKIT=1 docker build -t yhzhu99/tasks.md:4.1.2 -t yhzhu99/tasks.md:latest .
docker push yhzhu99/tasks.md:4.1.2
docker push yhzhu99/tasks.md:latest
```

## 🎨 Customize

You can customize the application CSS through `custom.css` (inside `CONFIG_DIR`,
or `/config` on Docker). Replace the default `adwaita` theme with `nord` or
`catppuccin`, or make your own. The easiest way is to reuse the existing color
variables:

- `color-accent`: highlight color;
- `color-foreground`: text color;
- `color-background-1…4`: layered background colors (app → header/lanes →
  cards → buttons/inputs);
- `color-alt-1…7`: tag colors, error/past-due colors.

For deeper changes use [index.css](frontend/src/stylesheets/index.css) as a
reference.

## 💡 Technology stack

Built with [SolidJS](https://github.com/solidjs/solid) on the frontend and
[Koa](https://github.com/koajs/koa) and Node.js SQLite on the backend.
[Yjs](https://yjs.dev/) and CodeMirror 6 provide collaborative Markdown editing. Card rendering uses
[marked](https://github.com/markedjs/marked) + [DOMPurify](https://github.com/cure53/DOMPurify).
Based on the great [Tasks.md](https://github.com/BaldissaraMatheus/Tasks.md)
by Baldissara Matheus.
