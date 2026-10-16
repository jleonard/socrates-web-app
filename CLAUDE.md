# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

Wonderway: a voice-first museum/place guide. Visitors talk to an ElevenLabs conversational agent in the browser; the agent calls back into this app's webhooks, which answer using RAG over museum content (Pinecone) and OpenAI.

## Commands

Node >= 22 (see `.nvmrc`).

```bash
npm run dev         # React Router dev server (Vite, http://localhost:5173), loads Sentry via instrument.server.mjs
npm run build       # production build -> build/server, build/client
npm start           # serve the production build
npm run lint        # eslint
npm run typecheck   # react-router typegen && tsc (run after adding/renaming routes)
npm run gen:types   # regenerate app/types/supabase.ts from the Supabase project
```

There is no test suite. `app/routes/api.eval-rag.ts` is a temporary retrieval eval harness (hit it in the browser while `npm run dev` is running; see the header comment for params).

## Stack

React Router v7 in framework mode (migrated from Remix, `ssr: true`, `v8_middleware` enabled), Tailwind + tailwind-variants, Zustand, react-aria-components, Supabase (auth + Postgres), Redis, Pinecone, OpenAI, ElevenLabs, Stripe, Sentry, i18next.

## Layout and conventions

- **Routing** is file-based via `flatRoutes()` (`app/routes.ts`). Larger routes are folders split into `route.ts` (re-exports + `meta`), `loader.ts`, `action.ts`, `view.tsx`. `tower*` routes are the internal admin area.
- **API routes are thin**: `app/routes/api.*.ts` just re-export a handler from `app/server/*.server.ts` (e.g. `api.agent.webhook.ts` -> `handleWebhook`). Put logic in `app/server/`.
- **Import aliases**: `~/*` -> `app/*`. Shared UI lives in the repo-root `components/` folder and is imported as `components/Foo/Foo` (each component has its own folder, often with a `.types.ts`).
- **Supabase clients** (`app/utils/supabase.server.ts`): `getSupabaseServerClient(request)` for the logged-in user, `getSupabaseServiceRoleClient()` for privileged server work. DB types come from `app/types/supabase.ts` (generated — don't hand-edit); app types are in `app/types/index.ts`.
- **i18n**: locales `en`/`es` in `app/utils/i18n/` (`config.ts`, `locales/<lng>/*.json`, also ElevenLabs voice per language). Server detection runs as root middleware (`app/middleware/i18next.server.ts`, `lng` cookie).
- Env vars are read directly from `process.env` (`.env` at repo root).

## Agent webhooks

The ElevenLabs agent calls a webhook as a tool (plain-text response; the agent's own LLM speaks it). Which agent the app starts comes from `utils/elevenlabs/agents.server.ts`: a name → agent id dictionary, chosen with `/app?agent=<name>` (kept in the session; `default` = `ELEVENLABS_AGENT`).

### Guide webhook (current) — `/api/agent/guide/webhook`

`app/server/api.agent.guide.webhook.server.ts`, with all its helpers in `app/server/guide/`. It must not import from `app/server/agent/` (that folder is being retired). Per request:

1. Parse args (`query`, `user_id`, `place`, `conversation_id`, coords). `mit` / `wonderway` are forwarded to the legacy handler.
2. `location.server.ts`: `place` → `{ locationId, placeId, exhibitionId }` via `location_relationships`.
3. `pronunciation.server.ts`: fix speech-to-text mishearings from Strapi dictionaries (`mispronunciations:<id>` in Redis).
4. `search.query.server.ts`: one LLM call → standalone English search query (follow-ups resolved from history, answer instructions and asserted claims removed). Used for retrieval and as the cache key only; the answer model gets the visitor's words. No query types — deliberately.
5. `cache.server.ts`: semantic cache on the search query (own Redis index `guide_cache`), scoped to location + content version. `GUIDE_CACHE_MODE` = `off` | `shadow` (default: log would-be hits, don't serve) | `serve`.
6. `retrieval.server.ts`: "here" pool = this exhibition + place-level content, both namespaces; a general search and a `chunk_type=visual_description` search, reranked together; gate on `RERANK_MIN` / `DENSE_FLOOR`; one chunk per object first, then fill by score.
7. `prompt.server.ts`: system rules (venue facts only from sources; general knowledge allowed with guardrails and framing; species facts never stated as specimen facts; identification one/several/none; attribute interviews) + SOURCES grouped by `scope`. Always answers in English (the voice agent translates). `venue.context.server.ts` adds the CMS prompt (`prompt:<id>`) as a source.
8. `answer.server.ts` streams the reply; `save.turn.server.ts` writes chat history (`chat:<user_id>`, shared with the history agent), `agent_history` (full record in `details`, `v: 1`) and a slim `event_log` event linked by `details.request_id`, before the stream closes.

### Old and legacy webhooks (being phased out)

`api.agent.webhook.server.ts` + `app/server/agent/` (query types, `QUERY_TYPE_CONFIG`) and `api.agent.webhook.legacy.server.ts`. MIT and wonderway still run on the legacy flow — **don't change it**; it will be removed once those places move to the guide.

## Content, metadata and ingest

- Pinecone index `wonderway`, namespaces `contextual` and `global`. The namespace split is NOT general vs specific; filter by metadata instead.
- Key chunk metadata: `place_id`, `exhibition_id`, `object_id`, `chunk_type` (`visual_description`, `ocr`, …), `scope` (`venue` | `object` | `universal`), optional `share` and `source_type` (e.g. `interview`, with `interviewee`). Untagged `scope` is inferred, defaulting to the narrowest.
- Strapi → `api.strapi.webhook.ts` (deletes by id prefix and stable `strapi_id`). Dropbox → `api.dropbox.ingest.ts` (records changes; `metadata.json` rows are `status: ignore`) then `api.dropbox.push-changes.ts` (n8n calls it every 20 min; batches heavy vision/OCR files within a time budget). Folder `metadata.json` files merge root → leaf onto every chunk below.
- Any content change bumps `cache_version:<id>` (`utils/cache/content.version.server.ts`), retiring cached guide answers for that location.

## Logging

`agent_history` and `event_log` keep only filtered/searched/human-written fields as columns (`user_id`, `conversation_id`, `app_version`, `query`, `response`, `qa`, …); everything else goes in the jsonb details. The older `tool_*` / `rag_*` / `text_*` columns on `agent_history` are deprecated (not written by the guide). `app_version` is `package.json`'s version, injected as `__APP_VERSION__` (`utils/app.version.ts`).

## Running ad-hoc checks

Use the project's Node via nvm (`source ~/.nvm/nvm.sh && nvm use`); the Supabase client fails on Node 20. Server modules can be loaded in a script with Vite's `ssrLoadModule` (alias `~` → `app`). These hit production Pinecone/Redis/Supabase: keep checks read-only unless asked, and use a fake UUID `user_id` for anything that writes, then clean it up.

## Session-driven flows (from README)

- **Promo codes** and **places** are only captured on the `/app` route: a `promo` or `place` query param is saved to the session cookie by the `app/` loader. After login, `/app` reads it back. Promo creates an access log; place goes to the front end and is stored in `stores/placeStore`.
- **Access**: the `app/` loader asks `server/access.manager.server.ts` whether the user can access the view and passes `access` to the front end. When a conversation starts without an expiration, one is set from the access record's `hours`. Guest access (`server/guest.manager.server.ts`) has been on since July 1 2026.
- **Payments**: Stripe checkout for day/week passes (`PRODUCT_DAY` / `PRODUCT_WEEK`); fulfilment happens in `api.stripe.webhook.tsx`.

`archive/` (old MIT RAG work, history, data exports), `trash/` and `.tmp/` (both gitignored) hold scratch files and data dumps. They aren't part of the app.
