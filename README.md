# PT Motivator — Ankle Recovery Tracker

A personal physical therapy tracker for ankle recovery. Check off exercises daily, add notes per exercise, watch video demos, and review your weekly progress — all saved to a Vercel Postgres database.

## Engineering Handoffs

- [Ask AI and agent architecture, rollout state, verification, and continuation guide](docs/ASK_AI_AGENT_HANDOFF.md)

## Features

- **Two categories**: Daily mobility & balance (most days) + Strength day (~3× per week)
- **Check off exercises** — tap a card to mark it done for today
- **Per-exercise notes** — add notes for each exercise on each day (how it felt, any pain, modifications)
- **Video demos** — tap the play button to watch a YouTube tutorial with curated tips
- **Weekly tracker** — 7-day dot chart showing completion fill-level per category
- **Cloud persistence** — all data saved to Vercel Postgres (no local-only storage)

## Stack

- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS v4**
- **Vercel Postgres** (`@vercel/postgres`)
- Deployed on **Vercel**

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/jqman23/PT_Motivator.git
cd PT_Motivator
npm install
```

### 2. Set up Vercel Postgres

1. Go to your [Vercel project](https://vercel.com/josh-kumins-projects/pt-motivator)
2. Add a **Postgres** database from the Storage tab
3. Pull env vars locally:

```bash
npx vercel env pull .env.local
```

Your `.env.local` will contain `POSTGRES_URL` and related vars.

### 3. Initialize the database

On first run, call the init endpoint once to create tables:

```bash
curl -X POST http://localhost:3000/api/init
```

### 4. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

Push to `main` — Vercel auto-deploys. Database env vars are already linked in the Vercel project.

## Adding / editing exercises

Edit [`lib/exercises.ts`](lib/exercises.ts). Each exercise has:
- `id` — unique slug used as the database key
- `cat` — `'mobility'` or `'strength'`
- `name`, `cue`, `sets` — display text
- `videoUrl` + `videoTitle` — YouTube link for the demo modal
- `tips` — bullet list shown in the video modal
- `optional` — shows "(optional)" label on the card

## API

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/init` | Create DB tables (run once) |
| `GET` | `/api/log?start=YYYY-MM-DD&end=YYYY-MM-DD` | Fetch completion log for date range |
| `POST` | `/api/log` | Upsert a completion entry `{ date, exerciseId, completed }` |
| `GET` | `/api/notes?date=YYYY-MM-DD` | Fetch all notes for a date |
| `POST` | `/api/notes` | Upsert a note `{ date, exerciseId, note }` |
