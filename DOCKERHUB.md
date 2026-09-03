# Tasks.md

Self-hosted task board whose source of truth is **a folder of Markdown files**. No database, no proprietary lock-in.

Boards and lanes are directories. Cards are `.md` files you can also edit, sync, and grep with anything else.

[GitHub](https://github.com/yhzhu99/Tasks.md) · [Keyboard shortcuts](https://github.com/yhzhu99/Tasks.md/blob/main/KEYBOARD_SHORTCUTS.md)

## Features

- Nested **child boards** above the columns; **lanes** only hold cards
- People, Review, and Done views across every board
- Assignees, tags, and due dates as Markdown tokens: `[person:Jane]` `[tag:urgent]` `[due:2026-01-31]`
- Markdown write/preview editor with image upload
- Search, filters, bulk edits, keyboard navigation
- Light/dark themes (Adwaita, Nord, Catppuccin) plus `custom.css`
- English / 中文
- `linux/amd64` and `linux/arm64`

## Quick start

```bash
docker run -d \
  --name tasks.md \
  -e PUID=1000 \
  -e PGID=1000 \
  -p 8080:8080 \
  -v /path/to/tasks:/tasks \
  -v /path/to/config:/config \
  --restart unless-stopped \
  yhzhu99/tasks.md:latest
```

Compose:

```yaml
services:
  tasks.md:
    image: yhzhu99/tasks.md:latest
    container_name: tasks.md
    environment:
      - PUID=1000
      - PGID=1000
    volumes:
      - ./tasks:/tasks
      - ./config:/config
    restart: unless-stopped
    ports:
      - "8080:8080"
```

Then open `http://localhost:8080`.

## Volumes

| Mount     | What it stores                                      |
| --------- | --------------------------------------------------- |
| `/tasks`  | The kanban itself: boards, lanes, and `.md` cards   |
| `/config` | Tag colors, lane order, uploaded images, `custom.css` |

## Environment

All optional. `PUID` / `PGID` are recommended so files on the host are owned by you.

| Variable                         | Default | Meaning                                              |
| -------------------------------- | ------- | ---------------------------------------------------- |
| `PUID` / `PGID`                  | —       | UID/GID that own files written to the volumes        |
| `TITLE`                          | —       | Browser tab title on the Home board                  |
| `BASE_PATH`                      | `/`     | URL prefix behind a reverse proxy (PWA needs `/`)    |
| `LOCAL_IMAGES_CLEANUP_INTERVAL`  | `1440`  | Minutes between unused-image cleanups; `0` disables  |

## Data model

```
/tasks                  Home
├── Website/            Child board
│   ├── Sprint/         Child board
│   │   └── Todo/       Lane
│   │       └── Fix login.md
│   └── Backlog/
└── Ops/
    ├── Doing/
    └── Done/
```

A **board** is a directory. A **lane** is a directory that holds `.md` files. A **child board** is a directory marked with `.board` (or that only contains other directories). Unlimited nesting.

## Source

<https://github.com/yhzhu99/Tasks.md>
