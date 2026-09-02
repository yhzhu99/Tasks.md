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
