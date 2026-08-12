# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

**Everything in this codebase is in Uzbek (Latin script)** — identifiers, function names,
comments, DB table/column names, commit messages, and user-facing strings. Match it. Do not
introduce English identifiers or comments; `tolov` (payment), `navbat` (duty rotation),
`xarajat` (expense), `topshiriq` (submission), `tasdiq` (confirmation), `jarima` (penalty),
`muddat` (deadline), `holat` (state), `sikl` (cycle), `ball` (points) are the core vocabulary.

Comments explain *why*, often naming the root cause of a past bug. Keep that density and style.

## Commands

```bash
npm run dev              # long polling, watch mode
npm test                 # node:test via tsx — pure functions only, no DB needed
npm run typecheck        # tsc --noEmit (strict, noUncheckedIndexedAccess)
npm run build            # tsc -p tsconfig.build.json + copy schema.sql to dist/

npm run db:setup         # apply src/db/schema.sql (idempotent, re-runnable)
npm run db:seed          # names/rooms from src/db/seed.ts

npm run webhook:set -- https://<project>.vercel.app
npm run webhook:info
npm run webhook:delete   # required before `npm run dev` — polling and webhook conflict
npm run commands:set     # push Telegram command menu
```

Run one test file: `node --import tsx --test src/core/tolov.test.ts`
Run one test by name: `node --import tsx --test --test-name-pattern "qisman" src/core/*.test.ts`

`.env` needs `BOT_TOKEN` and `DATABASE_URL` (Neon Postgres); `config.ts` throws at import
without them, so every test and script requires a valid `.env`.

## Two runtimes, one bot

`botYarat()` (`src/bot/index.ts`) builds the grammY bot for both:

- **Vercel (production)** — `api/webhook.ts` receives updates, `api/cron.ts` runs daily
  (Hobby plan allows only one cron/day).
- **Long polling** — `src/index.ts` with `node-cron`, used locally and for Docker/Fly.

Handler registration order in `botYarat()` matters: commands and callbacks first, the
catch-all `messages.register(bot)` last.

**grammY's `bot.catch` does not fire in webhook mode.** The real error boundary is the
`bot.use` middleware wrapper inside `botYarat()`. An uncaught error would return 500 and make
Telegram redeliver the update forever. Never let a handler throw past that wrapper.

## Layering

| Layer | Rule |
|---|---|
| `src/core/*` | SQL + business logic. **No grammY imports.** |
| `src/bot/text.ts` | Every user-facing string. Pure functions, no DB, no `ctx`. |
| `src/bot/keyboards.ts` | Every button and callback-data string. |
| `src/bot/handlers/*` | Telegram wiring only — call core, render via text.ts, reply. |
| `src/jobs/*` | Scheduled work; takes `Api`, calls core + `bot/group.ts`. |

Messages are HTML (`parse_mode: "HTML"`). Escape user-supplied text with `esc()`, format
money with `pul()`, and pass long output through `chekla()` (Telegram's 4096-char cap).

## No in-memory state

Serverless functions do not persist memory between invocations. Anything that must survive a
restart lives in Postgres:

- `flow_state` — multi-step conversations (`src/bot/state.ts`, `Flow` union type). Add a new
  step by extending `Flow` and dispatching in `handlers/messages.ts`.
- `pending_photos` — album buffering; Telegram delivers album photos as separate concurrent
  updates, so the row is locked `FOR UPDATE` to stop one album creating two submissions.
- reminder timestamps — see below.

## Reminders: one entry point, three triggers

`eslatmalarniTekshir(api)` in `src/jobs/reminders.ts` is the **only** reminder entry point.
It is called from three places: `api/cron.ts` (daily Vercel cron), `.github/workflows/eslatma.yml`
(hourly ping — the real guarantee), and `api/webhook.ts` inside `waitUntil()` (accelerator).

Because of that it may run many times a day, so it must be **idempotent**: it decides "is this
due now?" by comparing the current Tashkent date/time against a timestamp stored in the DB
(`turns.oxirgi_eslatma`, `turns.oxirgi_ping`, `tolov_holat.oxirgi_eslatma`,
`tolov_sikllari.guruh_eslatma`) — never from a one-shot boolean flag. Mark "sent" only after
delivery actually succeeded, otherwise a blocked account burns the whole day's slot.

**Do not add a second scheduler.** New periodic work goes inside `eslatmalarniTekshir`. Guard
expensive queries behind a cheap date check first — this function runs on every Telegram update.

## Ledger philosophy: no aggregate columns

There is no `users.ball` and no `tolovlar.jami_tolangan`. Totals are always recomputed from
historical rows (`core/rating.ts` sums `chores`/`expenses`/`turns`/`reports`/`ball_tuzatish`;
`core/tolov.ts` sums `tolovlar` within one cycle). Double-counting is therefore structurally
impossible.

The complement: **points are frozen onto the ledger row when it is confirmed**
(`chores.ball`, `expenses.ball`), so editing `BALLAR` in config never rewrites past results.
Same idea for `tolov_sikllari.talab` — each month copies the requirement at creation time.

Concurrency is handled the same way everywhere: `FOR UPDATE` inside `sql.begin`, plus a
`UNIQUE` index and `ON CONFLICT DO NOTHING` so a replayed write is a no-op.

## One submission pipeline

`navbat` (duty), `ish` (chore) and `xarajat` (purchase) are all rows in `submissions`,
confirmed through the same `confirmations` table and the same `core/topshiriq.ts` functions.
Confirmation requires `config.kerakliTasdiq` people and never the submitter; the extra
"not from the same room" rule applies to duty work only and lives in the navbat branch of
`handlers/confirm.ts`. Points come from config server-side — the client only ever sends the
*type* of work, never a score.

Closing a duty submission also advances the rotation, which is why `tasdiqla()` deliberately
stops short of it and `confirm.ts` finishes the job.

Do not add a parallel approval flow. Extend this one.

## Apartment payment (`core/tolov.ts`)

The most intricate module; read its header comment before changing it.

- **Monthly cycles** (`tolov_sikllari`, one row per calendar month). A payment is bound to a
  cycle by its **submission** date, never its verification date.
- **Claim vs verified**: `kiritgan_summa` is what the user typed and never counts;
  `tasdiqlangan_summa` is what the admin verified and is the only thing summed.
- **Deadline** is the 15th, evaluated at *end of day*; the snapshot runs on the 16th and is
  stored per (cycle, user) in `tolov_holat`, so later payments do not rewrite what was
  actually missing at the deadline.
- **Verification delay is never the user's fault**: someone who submitted before the deadline
  but is still awaiting review gets `tekshiruvKutilmoqda` and no penalty; confirming or
  rejecting recomputes their snapshot.
- **Penalty defaults to 0% (off)** — the house rules never defined one, so the bot exposes the
  shortfall to the admin instead of inventing a financial rule. Admin sets it with `/tolovjarima`.

## Time is always Asia/Tashkent

Use `src/core/vaqt.ts`. Calendar questions ("is today the 15th?", "how many days left?") are
answered with `YYYY-MM-DD` **strings**, not `Date` objects — string comparison sorts correctly
and cannot drift by a day across timezones. Read `DATE` columns with `to_char(col,'YYYY-MM-DD')`;
postgres.js otherwise returns them as UTC-midnight `Date`s, which is a day-shift trap.

`BIGINT` comes back from postgres.js as a **string** — always `Number(...)` it at the boundary.

Reusable SQL fragments must be **functions** returning `sql\`...\``, not shared constants;
postgres.js mutates a Query object when it inlines it as a fragment.

## Schema migrations

`src/db/schema.sql` is a single append-only, re-runnable file executed in one shot by
`db:setup` (`sql.unsafe(schema).simple()` — a multi-statement simple query runs in one implicit
transaction, so a syntax error rolls everything back). Add changes by appending idempotent
statements (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`DO $$ ... EXCEPTION WHEN duplicate_object THEN NULL; END $$`) with a comment explaining the
migration. Never edit earlier statements — production has already run them.

## Testing

`npm test` covers **pure functions only** (no DB, no network). When adding logic, extract the
decision into a pure function in `core/` and test that: `hisoblaDaraja`, `muddatNatijasi`,
`tolovEslatmasiKerakmi`, `navbatBalli`, `keyingiJoy`, and the `text.ts` renderers are all
shaped this way deliberately.

There is no DB test harness. Verifying SQL requires pointing `DATABASE_URL` at a scratch
database — never run write-path checks against the production Neon database.

## Privacy rules that are easy to break

- Payment card numbers and receipt images go **only** to the payer and to admin DMs. The group
  sees name, amount and status — nothing else.
- Anonymous complaints (`reports`): the *reporter* is never revealed to the group or to
  ordinary members, only to admins. The accused person *is* named in the group by design.
- Never log `ctx` — it contains the bot token (`xatoniYoz` in `bot/index.ts` exists for this).
