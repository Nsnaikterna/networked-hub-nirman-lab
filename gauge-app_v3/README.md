# Gauge — a calibration instrument for your own judgment

A reasoning-first learning tool that grades the gap between stated confidence and actual
outcome, not just the answer. Every problem runs through: **predict → act → reveal → compare**.
The dashboard is computed server-side from real logged attempts in a SQLite database — nothing
on the dashboard is sample data.

## Why this design (not a generic quiz app)

Standard grading only ever tells a learner "right" or "wrong." It never tells them whether their
own sense of "I've got this" was *justified*. That calibration gap — not raw knowledge — is what
leaves people frozen when scaffolding is removed (e.g. the school-to-independent-work transition).
This tool makes that gap visible and trackable per person, across any subject, without writing a
single line of new curriculum content — it's a thin layer over any multiple-choice problem bank.

## Stack

- **Backend:** Node.js + Express
- **Database:** SQLite via `better-sqlite3` (zero-config, file-based, no external service to provision)
- **Frontend:** Vanilla HTML/CSS/JS — no build step, so there's nothing that can fail to compile

## Run in GitHub Codespaces

1. Open this repo in a Codespace (the `.devcontainer` config auto-runs `npm install` on creation).
2. If it doesn't start automatically: `npm run dev`
3. Codespaces will prompt to forward port **3000** — open it in the browser preview.
4. Enter any name to start a session. Attempts persist in `db/gauge.db` (auto-created and
   auto-seeded with 16 problems on first run) across restarts.

## Run locally

```bash
npm install
npm run dev
# open http://localhost:3000
```

## API

| Method | Route                     | Purpose                                              |
|--------|----------------------------|-------------------------------------------------------|
| POST   | `/api/users`               | Create/fetch a user by name                           |
| GET    | `/api/problems/next`       | Get a random problem, optionally excluding recent ids |
| POST   | `/api/attempts`            | Log a predict+answer; returns correctness + delta     |
| GET    | `/api/users/:id/stats`     | Server-computed accuracy, calibration gap, bias, chart data |

## Extending it

- Add problems: append objects to `db/seedData.js` (only seeds on an empty table — delete
  `db/gauge.db` to reseed from scratch).
- Swap SQLite for Postgres later: the `db/index.js` module is the only file that touches the
  database engine directly; the route handlers in `server.js` only call `db.prepare(...).run/get/all`,
  so the migration surface is small.
- The confidence-prediction mechanic is subject-agnostic — the `category` field on problems is
  there so you can eventually filter the dashboard by topic.

## Known limitations (stated honestly, not hidden)

- No auth — "sessions" are just a name typed in, good enough for a classroom demo, not for
  production identity.
- The reveal messaging uses fixed confidence thresholds (70/40) rather than a model fit to this
  specific problem set's difficulty distribution.
- Single-user concurrency is fine for a demo; `better-sqlite3` is synchronous, so a real
  multi-classroom deployment would want to move to Postgres.

## v3: judgment profile

- Rounds of 10 questions (30-question bank in `db/seedData.js`: probability, statistics, ML concepts, reasoning traps).
- Profile per student (`lib/analysis.js`): accuracy, calibration gap, confidence separation (AUROC),
  four types (sure/unsure x right/wrong), topic table, trap rate, speed pattern, adjustment after a miss,
  and up to two rule-based suggestions. Profiles need at least 8 answers.
- Targeted rounds draw on the student's weakest topics; the summary compares each round with the previous one.
- Educator view groups the class by profile.
- To change questions, edit `db/seedData.js`, stop the server, delete `db/gauge3.db`, and restart (this clears attempts).
- Suggestions are fixed rules written by hand, not machine learning. Results are patterns in one session, not traits.
