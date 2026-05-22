# CLAUDE.md — Scoot Platform

This file tells Claude Code how to work on this project. Read it fully before making any changes.

---

## Persistent Memory — Check First on Every Fresh Machine

Claude's persistent memory for this project lives in the repo at **`.claude/memory/`** (index at `.claude/memory/MEMORY.md`, full entries in sibling files). It is symlinked into `~/.claude/projects/<repo-slug>/memory/` so the harness picks it up automatically.

**If you don't already see MEMORY.md loaded at session start**, the symlink isn't set up on this machine yet. Fix before doing anything else:

```bash
npm run setup:memory
```

Then read `.claude/memory/MEMORY.md` directly to pick up project context. Without the symlink, any new memories you write will land in `~/.claude/...` outside the repo and won't sync to other machines via git — which silently breaks the cross-machine workflow Brandon depends on.

If you're unsure whether the symlink exists, run `npm run setup:memory` — it's idempotent and will report "already linked" if it's already wired up.

---

## What This Project Is

Scoot is a social platform with three features:
1. **Chat** — messaging with rooms, media (images, video, files)
2. **Scoot currency** — custom blockchain wallet, send/receive
3. **LLM bot** — chat interface to a self-hosted vLLM backend

Architecture: thin web client (React), Node/Express API layer, C core daemon (`scootd`) that owns the blockchain and database. The client does nothing but render and call the API.

Read `arch/spec.md` for full detail on architecture, endpoints, folder structure, and build phases.

---

## Saving Conversation Transcripts

Worth-keeping conversations can be saved to the repo via `npm run session:save` (wraps `scripts/save-session.cjs`). With no args, it grabs the latest session. Pass `--title="..."` to override the slug. Output goes to `docs/sessions/YYYY-MM-DD-<slug>.{jsonl,md}` — raw JSONL for fidelity, a stripped markdown transcript for human reading. The repo is public/copyleft (per Brandon) so transcripts are share-friendly.

**Secret redaction (mandatory):** the repo is public. `scripts/save-session.cjs` runs a `redact()` pass over BOTH the JSONL and the MD before writing, masking known formats: Anthropic / OpenAI / GitHub / AWS keys, JWTs, hex strings ≥32 chars, DB connection-string credentials, and `(API|ACCESS|SECRET|PRIVATE|AUTH|BEARER|REFRESH|SESSION|CSRF)_(KEY|TOKEN|SECRET|PASSWORD|PASSWD)=value` patterns. The frontmatter records the count. If you spot a new secret format leaking through, extend `REDACTION_PATTERNS` in the script — never disable masking for convenience. If a real secret ever slips into a committed transcript, treat the credential as compromised and rotate; redacting in a follow-up commit does not erase git history.

---

## Reference Material — Read This Before Designing Scoot Features

`ip/inventions/asimov_v2.13.{pdf,md}` — Brandon's book defining the Scoot / Foundation / asimov system. The MD is grep-friendly text extraction (335 pages → ~12k lines). Read it when working on identity, governance, wallet, social-graph, or any feature involving Scoot semantics. Key spots:

- **Scoot Primer** (~MD line 737) — conceptual overview and vocabulary (pledge, scootage, trustee, scoot, asimov)
- **Appendix D — System Technical Description** (~MD line 8571) — domains, scootchain, responsibility/value, conformance rules

**Current build target: Scoot(34) = The Dream Laboratory (Fonde Brotherhood).** It is the first and currently only Scoot — but the app must be structured to host many Scoots, not be hardwired to one. A pickleball Scoot is the likely next.

**Vocabulary rule:** code, schema, and API use canonical Scoot terms (`pledge`, `scootage`, `trustee`, `scoot(X)`, `asimov`). User-facing strings render via a per-Scoot label map (e.g. Scoot(34) shows "Starter" for trustee, "Fonde Brotherhood" for scootage). Default to canonical when no override exists. Each Scoot eventually defines its terms in its charter.

---

## Developer Context

- Primary developer is a C programmer. C-like syntax (JS/TS) is comfortable.
- Not writing much code manually — Claude Code does the heavy lifting.
- Development environment: **WSL (Ubuntu on Windows)**, will deploy to Linux server.
- Target: web first, iPhone second, Android third.
- Claude Code runs with `--dangerously-skip-permissions` — full sudo access is expected and allowed.

---

## Git Commit Rules — CRITICAL

Claude Code must commit and push after EVERY meaningful change, including:
- After completing any feature or sub-feature
- After fixing any bug
- After any refactor
- After every debugging checkpoint, even if the problem is not yet solved
- Before switching tasks or files

**The developer works across 3 machines (laptop, home, work) and must be able to pull and continue from any machine at any time without losing work. Never leave uncommitted changes.**

Commit format:
```bash
git add .
git commit -m "short description of what changed"
git push
```

Use descriptive messages — examples:
- `"auth: fix session expiry on logout"`
- `"chat: add WebSocket reconnect logic"`
- `"debug checkpoint: scootd socket connection failing"`
- `"Phase 1 complete: auth + chat stubs running"`

Never batch up multiple sessions of work into one commit. Commit little and often. If in doubt — commit and push.

---

## Tech Stack — Quick Reference

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, wouter, TanStack Query |
| API server | Node.js, Express, TypeScript, Passport.js, Drizzle ORM, ws |
| C core | C11, libpq, pthreads, CUDA, HIP wrapper |
| Database | PostgreSQL |
| Media | Local FS or S3-compatible, HLS for video |

---

## Style Rules — NEVER Deviate From These

The UI matches the visual style of the previous `scoot0430` project. **Only the visual design is carried over — no code, routes, schema, or components are reused.** This is a clean-start codebase.

- **Background:** `bg-black` — pure black everywhere
- **Text:** `text-white`, muted items `text-white/70`
- **Primary color:** `hsl(0 0% 0%)` — black
- **Theme:** dark mode, professional variant
- **Border radius:** `0.5rem` (`rounded-lg` = `var(--radius)`)
- **Header:** black bar, white Scoot logo left, white nav right
- **Logo:** always use `white_on_transparent_scoot.png` on dark backgrounds
- **Components:** shadcn/ui on Radix UI — do not replace with other libraries
- **Fonts:** Tailwind system sans-serif default — do not change
- **Animations:** tailwindcss-animate only

Do not add color, gradients (except `from-primary to-primary/50` on auth split screen), or decorative elements not present in the original.

---

## Code Conventions

### TypeScript / React
- Functional components only — no class components
- `tsx` extension for all React files
- Props typed with inline interfaces, not `any`
- Use TanStack Query (`useQuery`, `useMutation`) for all server state
- Use `wouter` for routing — not React Router
- Form handling: `react-hook-form` + `zod` validation
- API calls go in `/ri/src/client/src/api/` — not inline in components
- Keep components thin — logic in hooks or api layer

### Node / Express
- TypeScript throughout
- Routes in `/ri/src/server/routes/` — one file per feature area
- All routes return JSON: `{ ok: true, data: ... }` or `{ ok: false, error: "..." }`
- Auth middleware applied at router level, not per-endpoint
- All Scoot/blockchain operations go through the C bridge — never implement blockchain logic in Node
- Drizzle for all Postgres queries from Node side

### C Core
- C11 standard (`-std=c11`)
- All public functions declared in `include/scoot.h`
- JSON protocol over Unix socket — use cJSON or similar lightweight parser
- Error returns: always return a JSON error object, never crash on bad input
- Threading: pthreads thread pool, configurable size
- GPU: use HIP abstraction (`#include <hip/hip_runtime.h>`) so code compiles for both CUDA and ROCm. Use `hipMalloc`, `hipMemcpy`, etc.
- Memory: no memory leaks — valgrind clean before committing

### General
- No `console.log` left in production paths — use proper logging
- No hardcoded secrets or URLs — always use env vars
- `.env.example` must be kept up to date when new env vars are added

---

## LLM Provider Abstraction

The bot feature must use a provider abstraction layer at `/ri/src/server/llm/provider.ts` so the backend can be swapped by config without code changes.

**Interface:**
```typescript
interface LLMProvider {
  chat(messages: {role: string, content: string}[], system?: string): Promise<string>;
}
```

**Implementations:**
- `AnthropicProvider` — uses Anthropic SDK, `claude-sonnet-4-20250514` default model
- `OpenAICompatProvider` — uses OpenAI SDK pointed at any compatible endpoint (vLLM, Ollama, etc.)

Active provider selected by `LLM_PROVIDER` env var (`anthropic` | `openai_compat`).

The bot route `/ri/src/server/routes/bot.ts` imports only the interface — never a specific provider directly.

---



The Node server communicates with `scootd` via Unix socket at `SCOOTD_SOCKET` (default `/tmp/scootd.sock`).

Messages are newline-delimited JSON. Every request includes a `req_id` for correlation. Every response echoes it back.

**Request format:**
```json
{"cmd": "get_balance", "user_id": 42, "req_id": "uuid-here"}
```

**Success response:**
```json
{"req_id": "uuid-here", "ok": true, "balance": 1500}
```

**Error response:**
```json
{"req_id": "uuid-here", "ok": false, "error": "user not found"}
```

The bridge file is `/ri/src/server/bridge/scootd.ts`. It handles:
- Socket connection and reconnection
- Sending requests with generated `req_id`
- Correlating async responses back to callers (promise map by req_id)
- Timeout handling (5 second default)

---

## Database

PostgreSQL. Schema lives in two places:

- `/ri/src/server/db/schema.ts` — Drizzle schema for Node-managed tables (users, sessions, chat, media metadata)
- `/ri/src/core/src/db.c` — direct libpq DDL for blockchain tables (blocks, transactions, addresses)

Run migrations: `npm run db:push` (Drizzle, Node tables only)
C tables: created by `scootd --init-db` on first run

---

## Video Player — Share Protection Requirements

The video player (`/ri/src/client/src/components/chat/VideoPlayer.tsx`) must:
- Use HLS.js for streaming — no direct MP4 src
- Disable right-click context menu on the video element
- Use custom controls only — no native browser controls (`controls` attribute removed)
- No download button anywhere in the UI
- Overlay a semi-transparent username watermark in the corner
- Video URLs must come from the server as signed, time-limited tokens

Never use `<video controls src="...">` directly.

---

## WebSocket

Live chat uses WebSocket at `ws://host/ws/chat/:roomId`.

- Server: `/ri/src/server/ws/chat-ws.ts` — manages room subscriptions, broadcasts
- Client: `/ri/src/client/src/hooks/use-websocket.ts` — connects, auto-reconnects, feeds TanStack Query cache

Message format:
```json
{
  "type": "message",
  "roomId": 5,
  "message": {
    "id": 123,
    "userId": 42,
    "content": "hello",
    "mediaUrl": null,
    "createdAt": "2025-01-01T00:00:00Z"
  }
}
```

---

## Build and Run (WSL / Local Dev)

```bash
# Install dependencies
npm install

# Set up env
cp .env.example .env
# Edit .env with your DATABASE_URL etc.

# Start Postgres (Docker)
docker compose up -d postgres

# Push DB schema
npm run db:push

# Build C core
cd ri/src/core && make && cd ../../..

# Start C daemon
./ri/src/core/bin/scootd --socket /tmp/scootd.sock &

# Start dev server (API + client via Vite proxy)
npm run dev
```

Dev server runs on `http://localhost:3000`. Vite proxies `/api` and `/ws` to Express.

---

## Build Phases — Current Status

Work through phases in order. Do not start Phase 2 until Phase 1 is complete and tested.

- **Phase 1** — Web foundation (scaffold, auth, chat, stub endpoints) ← START HERE
- **Phase 2** — C core integration (scootd daemon, C bridge, wallet)
- **Phase 3** — Blockchain (block structure, CPU threads, CUDA)
- **Phase 4** — Bot + protected video
- **Phase 5** — Mobile (React Native / Expo)

---

## Things Claude Code Should Never Do

- Do not copy any code from scoot0430 — style inspiration only, clean codebase
- Do not call LLM providers directly from routes — always go through `/ri/src/server/llm/provider.ts`
- Do not use React Router — use wouter
- Do not use `fetch` directly in components — use the `/ri/src/client/src/api/` wrappers
- Do not add new UI component libraries — use shadcn/ui only
- Do not change the dark/black color scheme
- Do not add `console.log` in production code paths
- Do not hardcode `localhost` URLs — use env vars
- Do not commit `.env` — only `.env.example`
- Do not use `any` type in TypeScript unless absolutely unavoidable and commented
- Do not implement GPU kernels without the HIP portability wrapper

---

## File Locations Quick Reference

**RI structure:** source lives in `ri/src/`, behavioral model in `ri/model/`, tests in `ri/src/server/services/`, IP in `ip/inventions/`, spec in `arch/`.

| What | Where |
|---|---|
| React pages | `ri/src/client/src/pages/` |
| React components | `ri/src/client/src/components/` |
| API call wrappers | `ri/src/client/src/api/` |
| Custom hooks | `ri/src/client/src/hooks/` |
| Tailwind config | `ri/src/client/tailwind.config.ts` |
| LLM provider abstraction | `ri/src/server/llm/provider.ts` |
| Anthropic provider impl | `ri/src/server/llm/anthropic.ts` |
| OpenAI-compat provider impl | `ri/src/server/llm/openai-compat.ts` |
| Express routes | `ri/src/server/routes/` |
| C bridge | `ri/src/server/bridge/scootd.ts` |
| Drizzle schema | `ri/src/server/db/schema.ts` |
| WebSocket server | `ri/src/server/ws/chat-ws.ts` |
| C source | `ri/src/core/src/` |
| C headers | `ri/src/core/include/` |
| CUDA kernels | `ri/src/core/cuda/` |
| Logo assets | `ri/src/client/public/assets/` |
| Env template | `.env.example` |
| Architecture spec | `arch/spec.md` |
| Behavioral model (Pass 1) | `ri/model/pass1_behavioral_model.md` |
| IP / design claims | `ip/inventions/scoot_design_claims.md` |
| Asimov reference book | `ip/inventions/asimov_v2.13.md` |
| Deployment config | `ri/physical/` |
| Handback to Steve | `HANDBACK_STEVE.md` |
