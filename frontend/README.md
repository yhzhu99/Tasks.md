# Tasks.md — frontend

SolidJS + Vite app. See the [root README](../README.md) for the full picture.

```bash
npm install        # install dependencies
npm start          # dev server with HMR on http://localhost:3000 (API on :8080)
npm run build      # production build into dist/
```

- `src/App.jsx` — board view, board/people routing, all board and card state;
- `src/components/` — UI components (sidebar, breadcrumbs, people view, cards,
  markdown editor, dialogs);
- `src/card-content-utils.js` — parse/manipulate `[person:]`, `[tag:]` and
  `[due:]` tokens in card markdown;
- `src/i18n/` — English / 中文 (`t()` helper);
- `src/stylesheets/` — app CSS; color themes live in `public/stylesheets/`.

Run the whole stack (API + web) from the repository root with `npm run dev`.

The settings browser regression uses an existing Playwright installation and a running
Vite server. API responses are mocked; it does not change workspace data.

```bash
VITE_PORT=13000 npm run dev
# In another terminal, from the repository root:
PLAYWRIGHT_MODULE=/path/to/playwright node --test frontend/test/settings.cjs
```

`TEST_BASE_URL` defaults to `http://127.0.0.1:13000`; `CHROME_PATH` defaults to
`/usr/bin/google-chrome`.
