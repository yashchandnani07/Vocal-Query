# Vocal Query

**Talk to your Postgres database like Siri.** Tap the orb and ask "Which city has the most customers?".
Gemini 3.8 Live writes the SQL, the app runs it on Neon Postgres, and the answer is shown on screen and
spoken back. Changes (INSERT / UPDATE / DELETE / DROP) only run after you say "yes" or click Confirm.

Built as a DBMS lab project: plain Node.js + Express + `pg`, plain HTML/CSS/JS, and **every SQL query
lives in the `sql/` folder**.

## Run it

```bash
npm install
npm start          # http://localhost:3000
```

Copy `.env.example` to `.env` and fill it in:

```
DATABASE_URL=...          # Neon pooled connection string (filled by `neon deploy`)
GEMINI_API_KEY=...        # Google AI Studio key
GEMINI_LIVE_MODEL=gemini-3.8-live
```

`APP_PASSWORD` is the one shared password for the app (the `/api` routes need a login cookie; see
`auth.js`). Locally it is optional; on Vercel it is required, otherwise the API answers 503.

Other scripts: `npm run build` (syntax check of all JS + SQL files present) and `npm test` (starts the
server and tests Neon + Gemini Live end to end). Voice needs Chrome or Edge and microphone permission.

## Pages

1. **`/`**: landing page
2. **`/import`**: load the demo database, upload a `.sql` file, or use your existing tables
3. **`/app`**: workspace: tables on the left, schema / ER diagram / query log in the centre,
   Vocal Query voice chat on the right

## Where are the queries? → `sql/`

| File | Type | When the app runs it |
|---|---|---|
| `00_drop_tables.sql` | DDL `DROP` | "Load demo database" (start fresh) |
| `01_create_tables.sql` | DDL `CREATE TABLE` | "Load demo database" |
| `02_insert_sample_data.sql` | DML `INSERT` | "Load demo database" |
| `03_create_app_tables.sql` | DDL `CREATE TABLE`, `ALTER TABLE` | every server start (`IF NOT EXISTS`): the app's own tables `database` and `voice_log` |
| `app/list_columns.sql` | `SELECT` on `information_schema` | schema view + told to Gemini |
| `app/list_keys.sql` | `SELECT` on `information_schema` | PK/FK for the ER diagram |
| `app/log_insert.sql` | DML `INSERT` with `$1..$6` | after every voice query |
| `app/log_recent.sql` | `SELECT` + `LEFT JOIN` | the Query log tab |
| `app/database_insert.sql` | DML `INSERT ... RETURNING` | when a database is loaded or uploaded |
| `app/database_latest.sql` | `SELECT ... LIMIT 1` | to link each query to the current database |
| `app/database_list.sql` | `SELECT` + `LEFT JOIN` + `GROUP BY` | the Databases tab |
| `examples/*.sql` | study material | never run by the app |
| `history/generated_queries.sql` | generated | every query Gemini wrote, appended as it runs |

That's the whole list. The only other SQL is the statement Gemini writes for you, plus
`BEGIN` / `COMMIT` / `ROLLBACK` in `db.js`.

**What is stored about the user?** Only the app's own two tables, linked by a foreign key:
`database` (one row for every database loaded or uploaded) 1 → N `voice_log` (what you said, the SQL,
the operation, OK/ERROR, rows affected, the time). Look at them with `SELECT * FROM database;` and
`SELECT * FROM voice_log ORDER BY id DESC;`

## How one voice command flows

```
You speak ─► browser mic (16 kHz audio) ─► Gemini 3.8 Live (WebSocket)
                                              │ calls tool run_sql("SELECT ...")
                                              ▼
            browser ─► POST /api/run ─► db.checkSql()  one statement? SELECT or a change?
                                              │
                    SELECT ──► runs in a READ ONLY transaction on Neon ──► rows
                    change ──► "needs confirmation" ─► you say "yes" ─► runs ─► rows changed
                                              │
                         saved to voice_log + sql/history/generated_queries.sql
                                              ▼
            rows go back to Gemini ─► it speaks a short answer, the table shows on screen
```

The browser never sees the Gemini API key. `POST /api/live-session` asks Google for a
single-use token that expires after a few minutes.

## Code map

| File | What it does |
|---|---|
| `server.js` | Express routes: `/api/demo`, `/api/import`, `/api/schema`, `/api/live-session`, `/api/run`, `/api/log` |
| `db.js` | The only file that touches Postgres. Loads the `sql/` files, the safety check, runs queries |
| `ai.js` | Gemini Live: system prompt, the 3 tools (`run_sql`, `confirm_pending_sql`, `cancel_pending_sql`), token |
| `public/` | `index.html`, `import.html`, `app.html` plus their CSS/JS. `voice.js` = Live session + mic + speaker. `diagrams.js` = schema visualizer + Chen ER diagram |
| `neon.ts`, `.neon` | Neon project link (created by `neon init`) |

## Try saying

- "Show all customers"
- "Which city has the most customers?"
- "Total money spent by each customer, highest first"
- "Add a customer named Neha Verma from Jaipur" → then "yes"
- "Change the price of the keyboard to 1800" → then "yes"
