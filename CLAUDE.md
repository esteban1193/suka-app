# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Suka App** (Interactive Scheduler) is a single-page React app for planning the daily activity schedule of Beit Tefilah Israeli's Sukkot festival space (the "Grand Sukkah"). It shows a 9-day grid (30-minute slots, 09:30–23:00) where activity "notes" — with title, duration, price, category, audience, contact, and organization — can be dragged onto a time slot, moved, resized, and edited. Built originally with ChatGPT in 2025; now maintained here with Claude Code.

There is currently no live production deployment target other than GitHub Pages — this is an internal planning tool used by Esteban (and whoever else plans the Sukkah program), not a public-facing app like the sibling `bti-siddur` project.

## Local Repository Path

```
C:\Users\Owner\projects\suka-app
```

## Commands

```bash
npm i            # Install dependencies
npm run dev      # Start dev server (Vite)
npm run build    # Production build to dist/
npm run preview  # Preview production build, port 5173
```

No test framework, no linter configured.

## Deployment

- GitHub repo: `esteban1193/suka-app`, default working branch `dev`.
- `.github/workflows/deploy.yml`: on every push to `dev`, builds and deploys `dist/` to **GitHub Pages** via `actions/deploy-pages`. `dist/index.html` is copied to `dist/404.html` so client-side routes don't 404 on refresh (not currently used for routing, but harmless).
- `vite.config.js` sets `base: '/suka-app/'` — **must match the GitHub repo name** if the repo is ever renamed.
- No `.env` / secrets — the app is 100% client-side with no backend. All state is `localStorage` only.

## Architecture

**Stack:** Vite + React 18 (no TypeScript), Tailwind CSS for styling, no state library, no router, no backend/DB.

**Everything lives in one file:** `src/App.jsx` (~1100 lines) is the entire app — a single `InteractiveSchedule` component. There are no subcomponents, no separate types, no utils file. `src/main.jsx` just mounts it; `src/index.css` is Tailwind boilerplate.

**Layout is RTL** (`dir="rtl"` on `<html>` in `index.html`), Hebrew-first UI, though the top-level flex layout of sidebar+grid is deliberately forced `dir="ltr"` on the outer wrapper so the sidebar/resizer/grid ordering behaves predictably, with `dir="rtl"` re-applied inside each region.

### State model (all in one `useState` per field, no reducer)

- `events`: array of event objects — the single source of truth. Each event: `{ id, title, duration, price, categoryKey, description, contact, contactPhone, organization, confirmed, placed, dayIndex, time }`. `placed: false` events sit in the sidebar "notes" list; `placed: true` events have `dayIndex` + `time` and render on the grid.
- `categories`: array of `{ key, name, color }`, user-editable, deletable (reassigns affected events to `general`).
- `startDate` → drives `days` (a `useMemo` that always generates exactly **9 days** from `startDate`, hardcoded `Array.from({length:9})`).
- UI/display state: `filterCategory`, `filterOrg`, `filterConfirmed`, `searchText`, `sumPlacedOnly`, `zoomDay`, `sidebarWidthPx`, `sidebarPos`, `dayColWidthPx`, `showPrices`.
- Everything above (except `showPrices`, which has its own key) is auto-saved to `localStorage` under `interactiveScheduler_v2` on every change, and reloaded once on mount. `showPrices` persists separately under `suka_showPrices`.

### Time/grid math

- `SLOT_MIN = 30`, `SLOT_PX = 40` — 30-minute slots, 40px tall each. `timeSlots` is a flat array of `"HH:MM"` strings from 09:30 to 23:00 generated once at module load.
- `slotIndex(time)` / `timeFromClientY(container, clientY)` convert between a time string and pixel position — this pairing is the core of drag-to-place and click-to-place.
- Event height/position (`boxStyleFor`) and resize (`startResize` + the `mousemove`/`mouseup` effect + `computeMaxBlocks`) are all derived from slot math, not stored separately — duration is the only persisted value, position is recomputed from `time`.
- Placing/moving an event goes through `placeEventExact(dayIndex, time, id, copy)`, which checks `hasConflict()` against all other `placed` events on the same day before committing. Holding Alt while dropping/dragging copies instead of moves (`ev.altKey`).

### Hardcoded data

- `HOLIDAYS_IL`: a hand-maintained `{ "YYYY-MM-DD": "Hebrew label" }` map for 2024–2027 Israeli holidays, shown under the day header when a date matches. **Needs manual extension** for years beyond 2027 or if labels need correcting — there is no library computing these dynamically.
- `DEFAULT_CATEGORIES`: 5 seed categories (כללי/מוזיקה/הוראה/לוגיסטיקה/אחר) — only used the very first time the app runs (no saved `categories` in localStorage); after that, the user's edited category list persists and this constant is ignored.

### Export / Import

- `exportJSON()` — dumps `{ startDate, events, categories }` to a downloaded `.json` file.
- `exportCSV()` — Hebrew-headered CSV with a UTF-8 BOM (`\uFEFF`) so Excel doesn't mangle Hebrew; manual CSV quoting (no library).
- `importJSON()` (paste into textarea) and `onImportFile()` (file picker) both expect the same `{ startDate, events, categories }` shape and fully replace current state — no merge, no dedup.
- `printPDF()` is just `window.print()`; the print CSS at the bottom of `App.jsx` forces A4 landscape and un-collapses the 9-column grid (`.print:hidden` / `.print:block` are hand-rolled, not Tailwind's real print variants).

## Known constraints to design around

- **Single price field per event** — no way to itemize cost components (e.g. artist fee + sound tech + equipment rental) that sum to a total. Any "cost breakdown" feature needs a new sub-structure on the event (e.g. `costItems: [{label, amount}]`) with `price` becoming a derived sum, and every place that reads `e.price` today (day totals, category totals, org totals, CSV export, event cards) needs to switch to the derived total.
- **No audience/age-group field** — events have no concept of "children / families / adults" today; this would be a new categorical field parallel to `categoryKey`, not a repurposing of categories (categories are about activity type, not audience).
- **No dedicated "browse all activities" view** — the sidebar's unplaced-notes list is the only place all events are visible together, and it's mixed in with the add-event form and only shows *unplaced* events, not everything. A "master library" view (all events regardless of placed state, grouped/filterable by category, price, audience) is a new UI surface, not an extension of the existing sidebar list.
- **No image field on events** — nothing in the event shape or UI supports attaching a picture.
- **No WordPress/Elementor or social media export** — fully out of scope of the current codebase; any automation here is new integration work (likely a separate script/service, since this is a static client-only app with no backend to hold credentials or push content).
- **Excel export today is CSV, not a real `.xlsx`** — good enough for Hebrew text but has no styling/multiple sheets/column typing; a real Excel export would mean adding a library (e.g. `xlsx`/`exceljs`).

## Editorial/UX conventions already established

- Hebrew UI copy throughout; keep new labels in Hebrew consistent with existing tone (short, direct, e.g. "הוסף פתק", "ייצא CSV").
- Currency is always ₪ (Israeli shekel), formatted with `.toLocaleString()`, no decimal enforcement.
- Confirmed vs. tentative events use a green checkmark toggle (`confirmed` boolean) — this is a placement-independent flag, distinct from `placed`.
- The "note" (sidebar, unplaced) and "block" (grid, placed) rendering of an event are two separate JSX blocks today (duplicated styling/buttons) rather than a shared subcomponent — worth factoring out into a shared `EventCard` component before adding more per-event UI (cost breakdown, audience badge, image thumbnail), since three more fields would triple the existing duplication otherwise.

## General rules

1. This is a small single-maintainer tool — prefer pragmatic, direct changes over heavy abstraction, but a growing feature set (cost breakdown, audience tags, images, library view) is a real signal to finally split `App.jsx` into components rather than keep growing the one file.
2. No backend exists. Any feature needing persistence beyond localStorage, credentials (WordPress API, social media APIs), or server-side rendering is a new architectural addition, not a small patch — flag it explicitly rather than bolting it onto the static Vite/GitHub Pages setup.
3. Preserve the existing localStorage schema (`interactiveScheduler_v2`) where possible when adding fields — add new optional fields to the `events`/`categories` shape rather than renaming/restructuring existing ones, so existing saved schedules in users' browsers keep loading.
