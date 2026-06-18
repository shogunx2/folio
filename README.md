# Folio

A mobile-first personal investment tracker. Import your broker statements and see
your net worth, allocation, and returns in one clean view — all stored locally on
your device.

Built with React + TypeScript + Vite, installable as a PWA, and designed around an
editorial-finance aesthetic (serif numerals, mono tickers, hairline depth, emerald
accent, light/dark).

## Features

- **Statement import** — Groww, Zerodha, and MF Central CSV/XLSX, parsed entirely
  client-side.
- **Portfolio overview** — net worth, invested capital, asset allocation, and XIRR.
- **Holdings & activity** — per-holding detail with price charts and transaction
  history.
- **Local-first & private** — holdings and transactions live in your browser
  (IndexedDB); nothing is sent to a server.
- **Installable PWA** — add to your home screen on iOS or Android; the app shell
  works offline.

## Getting started

```bash
npm install
npm run dev      # start the dev server
```

Then open the printed local URL.

## Scripts

| Command           | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the Vite dev server with HMR   |
| `npm run build`   | Type-check and build for production  |
| `npm run preview` | Serve the production build locally   |
| `npm run lint`    | Run ESLint                           |
| `npm test`        | Run the test suite (Vitest)          |

## Tech stack

React 19 · TypeScript · Vite · IndexedDB (`idb`) · Recharts · vite-plugin-pwa

## Notes

Price refresh currently relies on dev-only Vite proxies (Yahoo / AMFI), so live
quotes do not update in a deployed build — values are shown from the last import.
A small end-of-day price backend is planned.
