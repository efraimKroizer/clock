# Clock - Work Time Tracker

**Live app:** [time-track.thoughtsthinking.co.il](https://time-track.thoughtsthinking.co.il/)

Clock is a single-page time tracking app for managing work hours per project.
It is optimized for Hebrew and RTL usage, stores data locally in the browser, and includes daily and monthly reporting screens.

## What This Project Includes

- Daily time tracking per project (clock in / clock out)
- Automatic project switching (close active entries, then open target project)
- Project management (create, edit, pause/resume, delete)
- Editable entry rows (start/end times and notes)
- Daily KPIs and per-project summaries
- Monthly history view with printable report
- Persistent local storage with IndexedDB (Dexie)
- Unit tests (Vitest) and E2E smoke test (Playwright)

## Tech Stack

- Vue 3 + TypeScript
- Vite
- Vue Router
- Pinia
- Dexie (IndexedDB wrapper)
- Font Awesome
- Vitest + Playwright

## Project Structure

```text
src/
	App.vue                  App shell, header/nav/footer layout
	main.ts                  App bootstrap (Pinia + Router)
	router.ts                Routes + GitHub Pages hash/history switch
	db.ts                    Dexie schema and migrations
	types.ts                 Domain types (Project, TimeEntry, summaries)
	style.css                Global styles
	stores/
		projects.ts            Project CRUD + pause state
		timeEntries.ts         Time entries lifecycle and validation
	utils/
		time.ts                Duration/formatting/summarization helpers
	views/
		DashboardView.vue      Daily tracking dashboard
		ProjectsView.vue       Project management screen
		HistoryView.vue        Monthly history + print report

tests/
	unit/
		time.spec.ts           Unit tests for time utilities
	e2e/
		smoke.spec.ts          End-to-end smoke scenario
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm 10+

### Install

```bash
npm install
```

### Run in Development

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Testing

Run all tests:

```bash
npm test
```

Run unit tests only:

```bash
npm run test:unit
```

Run E2E tests only:

```bash
npm run test:e2e
```

## Docker

This repository includes a multi-stage `Dockerfile`.

Build image:

```bash
docker build -t clock-app .
```

Run container:

```bash
docker run --rm -p 8080:8080 clock-app
```

Then open `http://localhost:8080`.

## Deployment Notes

The app supports a GitHub Pages mode via `VITE_DEPLOY_TARGET=github-pages`.

- In this mode, Vite base path becomes `./`
- Router uses hash history instead of browser history

For standard hosting, leave `VITE_DEPLOY_TARGET` unset.

## Data and Persistence

- All app data is stored in browser IndexedDB (`workClockDB`)
- Deleting a project also removes its related time entries
- No backend service is required

## Language and UI

- The current UI text is in Hebrew
- Layout direction is RTL
- README and development documentation are in English
