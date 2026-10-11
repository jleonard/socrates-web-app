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

## Agent webhook pipeline (core logic)

`app/server/api.agent.webhook.server.ts` handles queries from the ElevenLabs agent and streams the answer back:

1. Resolve the `place` id to location/exhibition context. Some locations (`mit`, `wonderway`) are still routed to `api.agent.webhook.legacy.server.ts`.
2. Fix known mispronunciations for the exhibition (`agent/mispronounciations.ts`).
3. Check the Redis semantic cache (`utils/cache/`); on hit, stream the cached answer.
4. `agent/query.rewrite.server.ts`: one LLM call that both rewrites the query into clean English (`searchQuery`, used **only** for retrieval) and classifies it into an `AgentQueryType`. The visitor's original words are still used for the model, history and cache.
5. `agent/agent.config.ts` (`QUERY_TYPE_CONFIG`) maps each query type to tools, topK and prompt additions (incl. the `GROUNDING_RULE`). Geo queries use `agent/geo.search.ts`.
6. `agent/rag.retrieve.ts`: recall (Pinecone contextual + global) -> rerank -> gate on `RERANK_MIN` / `DENSE_FLOOR`. Below the gate, the no-context fallback instruction is injected instead of chunks.
7. OpenAI completion with the system prompt pieces from `utils/system.prompt.ts`, then log to agent history (`utils/history.server.ts`) and app events (`utils/events/`).

Content gets into Pinecone through the ingest webhooks (`api.dropbox.*`, `api.strapi.*`, `utils/ragIngest/`).

## Session-driven flows (from README)

- **Promo codes** and **places** are only captured on the `/app` route: a `promo` or `place` query param is saved to the session cookie by the `app/` loader. After login, `/app` reads it back. Promo creates an access log; place goes to the front end and is stored in `stores/placeStore`.
- **Access**: the `app/` loader asks `server/access.manager.server.ts` whether the user can access the view and passes `access` to the front end. When a conversation starts without an expiration, one is set from the access record's `hours`. Guest access (`server/guest.manager.server.ts`) has been on since July 1 2026.
- **Payments**: Stripe checkout for day/week passes (`PRODUCT_DAY` / `PRODUCT_WEEK`); fulfilment happens in `api.stripe.webhook.tsx`.

`archive/` (old MIT RAG work, history, data exports), `trash/` and `.tmp/` (both gitignored) hold scratch files and data dumps. They aren't part of the app.
