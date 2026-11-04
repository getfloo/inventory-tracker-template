# Inventory tracker on floo

An inventory tracker: items with a SKU, location, unit, quantity on hand and reorder
point, and the stock movements (in, out, adjustment) that change that quantity.
A live Next.js App Router app behind floo's gateway, with managed Postgres.
Keep one web service, TypeScript, Drizzle with postgres, and Tailwind CSS v4.
floo API calls go to `https://api.getfloo.com` with `Authorization: Bearer $FLOO_KEY`
and `X-Floo-Org-Id: $FLOO_ORG` (from `GET /v1/orgs`); take `$APP_ID` from
`GET /v1/apps`. Reference: `https://api.getfloo.com/openapi.json`.

## What this template already provides
The signed-in UI uses gateway identity from `lib/identity.ts`; `/api` is
key-authenticated. Zod validators generate the OpenAPI spec at
`/api/openapi.json`, and signed-in people see the same spec at `/api-docs`.
Migrations run once per deploy through `migrate_command`, a daily cron job records
low stock, and `scripts/test` checks the app. Extend these, do not rebuild them.

- `/`: item list with search, a low-stock filter and highlighting, a quick
  "record a movement" form, and the last low-stock check.
- `/items/[id]`: one item, its movement form and its latest 50 movements.
- `/items/new`, `/items/[id]/edit`: admins only.
- `/api/items`, `/api/items/{id}`, `/api/items/{id}/movements`: the agent API.

## Inventory rules (keep these true)
- `items.quantity_on_hand` always equals the sum of the item's
  `stock_movements.quantity_change`. Only `applyMovement` in `lib/inventory.ts`
  writes it, in the same transaction that inserts the movement, with the item row
  locked (`FOR UPDATE`). Never update the quantity anywhere else, and never add a
  second counter. To set a count, record an `adjustment`.
- Signs: `in` is positive, `out` negative, `adjustment` any non-zero change. A
  database check enforces this, and another keeps quantity on hand at zero or more;
  a movement that would go below zero is refused (`InsufficientStock`, API 409).
- Low stock means quantity on hand at or below the reorder point: `isLowStock` in
  `db/schema.ts` for queries, `isLow` in `lib/inventory.ts` for loaded rows.
- Roles come from `X-Floo-User-Role`. `admin` adds and edits items (`getAdmin()`,
  checked in the server action as well as the page). `member` and admin record
  movements. API keys list and read items and record movements; they do not
  create items. Every movement stores who recorded it (`actor_id`, `actor_name`).
- Items are never deleted: their movement history is the audit trail.

## Where to work
- Pages: `app/`. `app/layout.tsx` wraps every page in the top bar and a wide content
  area: set `APP_NAME` there and link each new page from its nav. Global styles and
  Tailwind theme: `app/globals.css`.
  Style with its tokens (`bg-canvas`, `bg-panel`, `text-ink`, `text-muted`,
  `border-line`, `bg-accent`), not raw palette colors; tables and form fields are
  styled bare. Show a status as `text-warning` on `bg-warning-soft` (also `success`,
  `danger`). To rebrand, change `--color-accent` and `--color-accent-hover` there.
- Server actions: `app/actions.ts` (`"use server"`). Forms that show errors are client
  components in `app/forms.tsx` (`useActionState`); shared server UI is `app/ui.tsx`.
- JSON API: `app/api/<name>/route.ts`, its contract in `app/api/<name>/openapi.ts`;
  see `app/api/items/`. List operations in `app/api/operations.ts`. An operation's
  `params` and `query` zod objects become its OpenAPI path and query parameters.
- Feature logic shared by pages, actions, the API and the seed script:
  `lib/inventory.ts`. Validate once there.
- Tables: `db/schema.ts`; connection: `db/index.ts`; user directory: `db/users.ts`.
- SQL and snapshots: `drizzle/`; migration runner: `scripts/migrate.ts`.
- Cron script: `scripts/low-stock.ts`; sample data: `scripts/seed.ts`.
- Who is calling: `lib/identity.ts`; tests: `tests/*.test.ts`.

## Callers and identity
Never add auth, sessions, tokens, login pages, or local identity stubs. Sign-out is
the form in `app/layout.tsx` that posts to the gateway's `/__floo/logout`; keep it.
The gateway is the only ingress (`access_mode = "accounts"`) and it asserts who
is calling in `X-Floo-*` headers; it strips any the client sent.
- Pages and actions serve signed-in people. Call `getIdentity()`; it returns
  `{ kind: "user", id, email, name, role }` and throws if the request did not
  come through the gateway. Roles pass through unchanged.
- `/api` serves programs. Call `callerFrom(request.headers)`. The floo key of
  anyone with access to the app (their agent, through `curl` or the floo MCP)
  returns that user, with their role. An app API key returns `{ kind: "api_key", id, name, keyId,
  scopes }`, where `id` is the key's consumer, stable across key rotation.
- Use the returned `id` for `actor_id` and any ownership filter, never a submitted id.
- Use `getDb()`; `DATABASE_URL` is the only credential this app reads. Never
  write connection strings or read `PG*`, keys, or other credentials.

## Run locally (Node.js 22.12+, 24+, or 26+)
Run `npm install`. `npm test` runs route type generation, typecheck, lint, and Vitest
without a database. `floo dev --fixture-user you@example.com --fixture-role admin`
runs migrations and the app against the dev database and prints an auth-proxied URL
that sends the gateway's identity headers. `floo run --service web -- npm run seed`
loads sample items into an empty dev database (it never runs on deploy). Without the
CLI, to run the app signed in on the dev database,
`POST /v1/apps/$APP_ID/dev-session` `{"services":[{"name":"web","port":3000}]}`, run
`npm run dev` with the returned `services.web` env, and send `X-Floo-User-Id`, `-Email`,
`-Name` and `-Role` as the gateway would; `DELETE .../dev-session/<session_id>` after.
Key-authenticated calls are tested against the deployed app (below), not locally.

## Add a table and ship
```sh
# edit db/schema.ts
npm run db:generate
git add db/schema.ts drizzle/
npm run build && npm test
git add . && git commit -m "Add application feature"
git push
```
Then `GET /v1/apps/$APP_ID/deploys?commit_sha=<full sha>`, retrying while empty, and
`GET .../deploys/<id>?wait=45` until it finishes, `live` or failed (`floo deploys watch`).
Generate through this script so SQL references stay schema independent.
Commit the generated SQL, journal, and snapshots; never edit applied migrations.
A failed migration stops the deploy and keeps the previous revision live. Keep
migrations out of the start command: every cold start would wait on them.

## Add an API endpoint
1. Put the handler at `app/api/<name>/route.ts`, export `GET`/`POST`, and read the
   caller with `callerFrom(request.headers)`. Everything under `/api` is already
   declared in `floo.app.toml` (`[[routes]]`, `access = "api_key"`, `scope = "api"`);
   add a new `[[routes]]` entry only for a path outside `/api`.
2. Validate input with a zod schema in `lib/<feature>.ts` and share it and the
   queries with the UI.
3. Describe the endpoint in `app/api/<name>/openapi.ts` with that same schema and
   add its `operations` to `app/api/operations.ts`. Both `/api/openapi.json` and
   `/api-docs` update from it. `scripts/test` fails if a handler is undocumented
   or a response does not match its schema.
4. Push, then call it as yourself with your floo key. On `/api` the gateway
   admits app members, strips the key, and passes your identity, so `callerFrom`
   returns you:
```sh
curl -H "Authorization: Bearer $FLOO_KEY" "https://<app>-dev.on.getfloo.com/api/items?low=true"
curl -H "Authorization: Bearer $FLOO_KEY" https://<app>-dev.on.getfloo.com/api/openapi.json
```
With the floo MCP connected, `search_app_api`, `read_app_api` and `write_app_api`
do the same; pass `environment: "dev"` while you build, `"prod"` only for live
data. For a program that is not you, mint an app API key:
`POST /v1/apps/$APP_ID/consumers` `{"name":"my-agent"}` (`floo apps consumers create
my-agent`), then `POST .../consumers/<id>/keys` with `{"name":"my-agent-key","scopes":["api"]}`;
its `raw_key` is shown once (`floo apps keys create my-agent-key --consumer my-agent
--scope api`). Hand that program the app URL and its key: `/api/openapi.json` tells it the rest.
Wrong or missing keys get the gateway's 401 before reaching the app. Scopes are
exact labels: a key must hold the route's `scope` to pass. Keep `scope = "api"`:
keys belong to one app, so no other app's key can pass, and renaming a scope after
the first deploy is refused on push.

## Services you can declare (in floo.app.toml, changed through git)
- Postgres: `[managed.default] type = "postgres"` injects `DATABASE_URL` (present).
  A second one, `[managed.<name>]`, injects `DATABASE_URL_<NAME>`.
- Redis: `[managed.cache] type = "redis"` injects `REDIS_URL_CACHE`; as
  `[managed.default]` it would be `REDIS_URL`. Cache only, no durability.
- File storage: `[managed.files] type = "storage"` injects `STORAGE_BUCKET_FILES`
  and S3 keys `STORAGE_S3_{ENDPOINT,ACCESS_KEY_ID,SECRET_ACCESS_KEY,REGION}_FILES`.
  Use any S3 client (boto3 1.36+) with checksum calculation `when_required`.
- Cron: `[cron.<name>]` with `schedule` (UTC; there is no timezone field),
  `command`, `service = "web"`, `timeout`. The command runs in this image with the
  service's `DATABASE_URL`, so package its script (and anything it imports) in
  `Dockerfile` and keep `tsx` to run TypeScript. `[cron.low-stock]` is the example:
  it runs `scripts/low-stock.ts`, which imports only `db/schema.ts` (no `server-only`,
  no `@/` paths). Jobs do not retry; `floo cron run low-stock` runs one now and
  `floo logs query --cron low-stock` shows its output.
- Environment variables: list names, never values, in `[services.web.env] required`,
  then `POST /v1/apps/$APP_ID/env` `{"key":"NAME","value":"...","is_secret":true}`
  (`floo env set NAME --stdin --secret`), or `"is_secret":false` for readable config
  (`floo env set NAME=value --config`). floo owns `DATABASE_URL`.

## When a deploy fails
`GET /v1/apps/$APP_ID/deploys/<id>` names what failed in `failure_step` and `diagnostics`
(`floo deploys watch`); `build_logs` holds build, startup and migration output
(`floo deploys logs`). Runtime logs: `GET /v1/apps/$APP_ID/logs` (`floo logs query`).
