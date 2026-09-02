# ![logo](public/logo.png) Tasks.md

A self-hosted, Markdown file based task management board.

Your kanban is **just a folder tree on disk**: boards, lanes and cards are
directories and `.md` files you can also read, sync and edit with any other
tool.

## ⭐ Features

- **Nested boards** — organize work as `Project → Board → Lane` (infinitely
  nestable). Sub-folders inside a lane show up as nested board cards; board-only
  folders appear as tiles. Navigate with the sidebar, breadcrumbs and clicks;
- **People view** — a global page with everyone's TODOs, grouped by assignee
  across all boards, sorted by due date;
- **Review & done** — mark a card for acceptance (highlighted, with timestamp)
  then complete it; completed cards move to a Done archive with the time they
  finished;
- Cards support **assignees, tags and due dates** written as plain Markdown
  tokens (`[person:Jane]`, `[tag:urgent]`, `[due:2026-01-31]`);
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

Everything is derived from the filesystem — no database, no migration:

| Concept   | On disk                                          |
| --------- | ------------------------------------------------ |
| Board     | any directory (`TASKS_DIR` root is *Home*)       |
| Lane      | a directory that contains `.md` files directly   |
| Sub-board | a directory that contains only directories       |
| Nested board | a sub-folder inside a lane, shown as a card on that lane |
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

Tag colors, lane ordering and uploaded images are kept in `CONFIG_DIR`
(`tags.json`, `sort.json`, `images/`). Names starting with a dot are hidden.
Avoid creating a board named `_people` (People view), `_done` (completed
archive) or `_api`.

## 🐋 Installation

### Docker

```bash
docker run -d \
  --name tasks.md \
  -e PUID=1000 \
  -e PGID=1000 \
  -e TITLE="" \
  -e BASE_PATH="" \
  -e LOCAL_IMAGES_CLEANUP_INTERVAL=1440 \
  -p 8080:8080 \
  -v /path/to/tasks/:/tasks/ \
  -v /path/to/config/:/config/ \
  --restart unless-stopped \
  yhzhu99/tasks.md
```

Remove the environment variables you don't want to keep (all of them are
optional, `PUID` and `PGID` are recommended) and replace `/path/to/something`
with directories that exist in your filesystem:

- `PUID` / `PGID`: UID and GID that own the created files and directories
  (usually `1000`; see [the docs](https://docs.linuxserver.io/general/understanding-puid-and-pgid/));
- `TITLE`: name shown in the browser tab on the Home board;
- `BASE_PATH`: base URL path, for subpath based reverse proxies (PWA only
  works with `/`);
- `LOCAL_IMAGES_CLEANUP_INTERVAL`: minutes between cleanups of local images
  no longer referenced by any card (default `1440`; `0` disables it).

### docker-compose

```yaml
services:
  tasks.md:
    image: yhzhu99/tasks.md
    container_name: tasks.md
    environment:
      - PUID=1000
      - PGID=1000
    volumes:
      - /path/to/tasks:/tasks
      - /path/to/config:/config
    restart: unless-stopped
    ports:
      - 8080:8080
```

## 💻 Run from source (one command)

Requires [Node.js 24 LTS](https://nodejs.org/). With [fnm](https://github.com/Schniz/fnm):

```bash
fnm install   # installs the version from .node-version
fnm use       # activates it in this shell
npm run dev   # one command: installs deps + starts the whole stack
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
| `npm run build` | build the frontend into `frontend/dist`                               |
| `npm run setup` | (re)install root, backend and frontend dependencies                   |

## 🚀 Build & publish the Docker image

The `yhzhu99/tasks.md` image is built and published automatically: push a git
tag (e.g. `v4.0.0`) and GitHub Actions builds multi-arch images
(`linux/amd64`, `linux/arm64`) and pushes `4.0.0`, `4.0`, `4`
and `latest` to Docker Hub.

This needs two repository secrets (GitHub → Settings → Secrets and variables
→ Actions):

- `DOCKER_USERNAME` → `yhzhu99`
- `DOCKER_PASSWORD` → a Docker Hub [personal access token](https://docs.docker.com/security/for-developers/access-tokens/) with Read & Write

```bash
git tag v4.0.0 && git push origin v4.0.0
```

To build and push locally instead:

```bash
docker login -u yhzhu99
DOCKER_BUILDKIT=1 docker build -t yhzhu99/tasks.md:4.0.0 -t yhzhu99/tasks.md:latest .
docker push yhzhu99/tasks.md:4.0.0
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
[Koa](https://github.com/koajs/koa) on the backend. Card rendering uses
[marked](https://github.com/markedjs/marked) + [DOMPurify](https://github.com/cure53/DOMPurify).
Based on the great [Tasks.md](https://github.com/BaldissaraMatheus/Tasks.md)
by Baldissara Matheus.
