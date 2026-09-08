# Scoot Platform — Project Specification

## Overview

Scoot is a social platform combining:
1. **Chat messaging** — rooms, direct messages, media (images, video, files)
2. **Scoot social currency** — custom blockchain, wallet management, transactions
3. **LLM chatbot frontend** — UI connecting to a swappable LLM backend (Claude API now, vLLM/self-hosted later)

Architecture philosophy: **thin client, heavy server**. The client renders UI and makes API calls. All business logic, blockchain operations, and data management live on the server.

---

## Deployment Targets

| Priority | Platform | Approach |
|---|---|---|
| 1 | Web (browser) | React + Vite |
| 2 | iPhone | React Native (Expo) — later phase |
| 3 | Android tablet | React Native (Expo) — later phase |

Development starts web-only. Mobile is a future phase after web is stable.

---

## Tech Stack

### Frontend (client/)
- **React 18** + **TypeScript**
- **Vite** — build tool and dev server
- **Tailwind CSS** — styling (carried over from scoot0430)
- **shadcn/ui** + **Radix UI** — component library (carried over from scoot0430)
- **wouter** — lightweight client-side routing
- **TanStack Query** — server state, caching, mutations
- **react-hook-form** + **zod** — form validation
- **WebSocket (ws)** — live chat delivery

### API Server (server/)
- **Node.js** + **Express** — HTTP API layer
- **TypeScript**
- **Passport.js** — session-based authentication
- **express-session** + **connect-pg-simple** — sessions stored in Postgres
- **Drizzle ORM** — type-safe Postgres queries
- **ws** — WebSocket server for live chat
- **C bridge** — Unix socket or subprocess interface to C core

### C Backend (core/)
- **C (C11/C17)** — core logic, blockchain, database operations
- **PostgreSQL libpq** — direct database access from C
- **pthreads** — CPU-parallel execution
- **CUDA** — GPU-parallel execution (primary)
- **HIP abstraction layer** — portability wrapper (CUDA/ROCm/other)
- Runs as a persistent daemon, multiple instances across nodes
- Exposes Unix socket or TCP socket for API server bridge

### Database
- **PostgreSQL** — primary datastore
- Schema managed via Drizzle (Node side) and direct DDL (C side)

### Media Storage
- **Local filesystem or S3-compatible object store** — images, video, files
- Served via signed URLs with expiry (anti-sharing for video)

---

## System Architecture Diagram

```
┌─────────────────────────────────────────┐
│           Browser / Mobile              │
│         React + Tailwind UI             │
└────────────────┬────────────────────────┘
                 │ HTTPS / WSS
┌────────────────▼────────────────────────┐
│         Node/Express API Server         │
│   Auth │ Chat │ Scoot │ Bot │ Media     │
│              C Bridge                   │
└────────────────┬────────────────────────┘
                 │ Unix socket / TCP
┌────────────────▼────────────────────────┐
│           C Core Daemon (scootd)        │
│  Blockchain │ DB │ CPU threads │ CUDA   │
│         (multi-node capable)            │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│              PostgreSQL                 │
└─────────────────────────────────────────┘

                 ┌───────────────────────┐
                 │  LLM Backend          │  ← Claude API (now) / vLLM (later)
                 │  provider abstraction │
                 └───────────────────────┘
```

---

## Folder Structure

**Current layout (reconciled 2026-09-08 against the tree).** The original plan below used
`/client`, `/server`, `/core`, `/shared` at the repo root; they became `ri/src/client`,
`ri/src/server`, `ri/src/core`, `ri/src/shared` under the RI pass structure
(`ri/model` = Pass 1, `ri/src` = Pass 2, `ri/sim` = Pass 3, `ri/physical` = deployment).
Directories to depth 3, generated from disk:

```
.
./.claude
./.claude/memory
./arch
./arch/plans
./docs
./docs/sessions
./ip
./ip/inventions
./ri
./ri/model
./ri/personalities
./ri/personalities/bigmo
./ri/personalities/claude
./ri/physical
./ri/physical/apache
./ri/physical/legal
./ri/physical/systemd
./ri/sim
./ri/src
./ri/src/client
./ri/src/core
./ri/src/server
./ri/src/shared
./ri/validation
./scoot-chat
./scripts
./tools
./tools/player-cards
./tools/player-cards/__pycache__
./tools/player-cards/art
./tools/player-cards/assets
```

Notable additions since the plan: `ri/src/server/sms/` (BigMo SMS commissioner),
`ri/src/server/trust/` (staking / trust graph), `ri/src/server/scoot/` (currency ledger),
`ri/src/server/cards/` + `tools/player-cards/` (player-card pipeline), `ri/src/server/mail/`
(poller, digest), `ri/personalities/` (bot prompts), `scripts/` (host cron/systemd jobs),
`docs/` (transcripts, RIM documents).

### Original plan (2026-05, historical)


```
/scoot
│
├── CLAUDE.md                    ← Claude Code instructions
├── SPEC.md                      ← This file
├── docker-compose.yml           ← Local dev orchestration
├── .env.example
│
├── /client                      ← React web app
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts       ← Ported from scoot0430
│   ├── tsconfig.json
│   └── /src
│       ├── App.tsx
│       ├── main.tsx
│       ├── index.css            ← Tailwind + CSS vars (dark theme)
│       ├── /pages
│       │   ├── auth-page.tsx
│       │   ├── chat-page.tsx
│       │   ├── wallet-page.tsx
│       │   ├── bot-page.tsx
│       │   └── not-found.tsx
│       ├── /components
│       │   ├── /layout
│       │   │   ├── header.tsx   ← Black header, Scoot logo, nav
│       │   │   └── footer.tsx
│       │   ├── /chat
│       │   │   ├── Chat.tsx
│       │   │   ├── MessageList.tsx
│       │   │   ├── MediaDisplay.tsx
│       │   │   └── VideoPlayer.tsx   ← Protected video player
│       │   ├── /scoot
│       │   │   ├── Wallet.tsx
│       │   │   ├── TransactionList.tsx
│       │   │   └── SendScoot.tsx
│       │   ├── /bot
│       │   │   └── BotChat.tsx
│       │   ├── /logos
│       │   │   └── scoot-logo.tsx
│       │   └── /ui              ← shadcn/ui components
│       ├── /hooks
│       │   ├── use-auth.ts
│       │   └── use-websocket.ts
│       ├── /lib
│       │   ├── queryClient.ts
│       │   └── protected-route.tsx
│       └── /api                 ← Typed fetch wrappers
│           ├── auth.ts
│           ├── chat.ts
│           ├── scoot.ts
│           └── bot.ts
│
├── /server                      ← Node/Express API
│   ├── index.ts
│   ├── app.ts
│   ├── /routes
│   │   ├── auth.ts
│   │   ├── chat.ts
│   │   ├── scoot.ts
│   │   ├── bot.ts
│   │   └── media.ts
│   ├── /bridge
│   │   └── scootd.ts           ← Unix socket client to C core
│   ├── /db
│   │   ├── schema.ts           ← Drizzle schema
│   │   └── index.ts
│   ├── /ws
│   │   └── chat-ws.ts          ← WebSocket server
│   └── /middleware
│       ├── auth.ts
│       └── upload.ts
│
├── /core                        ← C backend daemon
│   ├── Makefile
│   ├── /src
│   │   ├── main.c              ← Daemon entry, socket listener
│   │   ├── blockchain.c        ← Scoot chain logic
│   │   ├── wallet.c            ← Address/key management
│   │   ├── transaction.c       ← TX creation, signing, validation
│   │   ├── db.c                ← libpq database ops
│   │   ├── parallel.c          ← Thread pool (pthreads)
│   │   ├── gpu.c               ← CUDA/HIP dispatch
│   │   └── protocol.c          ← JSON command protocol
│   ├── /include
│   │   └── scoot.h
│   └── /cuda
│       └── kernels.cu          ← CUDA kernels
│
└── /shared
    └── schema.ts               ← Zod schemas shared by client+server
```

---

## API Endpoints

Base: `/api/v1`

### Auth
```
POST   /auth/register
POST   /auth/login
POST   /auth/logout
GET    /auth/me
```

### Chat
```
GET    /chat/rooms
POST   /chat/rooms
GET    /chat/rooms/:id
POST   /chat/rooms/:id/messages
GET    /chat/rooms/:id/messages?before=<timestamp>
POST   /chat/rooms/:id/media         ← upload image/video/file
WS     /ws/chat/:roomId              ← live messages
```

### Scoot Wallet
```
GET    /scoot/balance
GET    /scoot/transactions
POST   /scoot/send
GET    /scoot/address
GET    /scoot/receive                ← QR / receive address
```

### Bot
```
POST   /bot/message
GET    /bot/history
POST   /bot/reset
```

### Media
```
GET    /media/:id                    ← returns signed URL
GET    /media/:id/stream             ← protected video stream
```

---

## C Core Protocol

The API server communicates with `scootd` via a Unix socket at `/tmp/scootd.sock`.

Messages are newline-delimited JSON:

**Request:**
```json
{"cmd": "get_balance", "user_id": 42, "req_id": "abc123"}
```

**Response:**
```json
{"req_id": "abc123", "ok": true, "balance": 1500, "address": "SCT1abc..."}
```

**Commands:**
- `get_balance` — user's Scoot balance
- `get_transactions` — transaction history
- `send` — initiate a transfer (amount, from, to)
- `get_address` — user's blockchain address
- `validate_block` — validate a proposed block (GPU-accelerated)
- `mine_block` — mine/propose a block
- `get_chain_status` — node health, block height, peers

---

## Video Player — Share Protection

The video player must make casual sharing difficult (not DRM, but friction):

- Video served only via signed, time-limited URLs (5 min expiry)
- No native browser `<video>` controls — custom player only
- Right-click / context menu disabled on video element
- No download button
- HLS streaming preferred over direct MP4 (harder to grab)
- Watermark overlay with username burned in client-side

---

## Style System

Carried from scoot0430 **visually only** — no code, routes, schema, or components are reused. This is a clean-start project that matches the same look and feel.

- **Theme:** Dark — `appearance: dark`, professional variant
- **Primary color:** `hsl(0 0% 0%)` — pure black
- **Background:** Black (`bg-black`)
- **Text:** White (`text-white`), muted at `text-white/70`
- **Border radius:** `0.5rem`
- **Header:** Black bar, white Scoot logo left, white nav right
- **Logo assets (copy from scoot0430/attached_assets):**
  - `white_on_transparent_scoot.png` — for dark backgrounds (primary)
  - `scoot_black_on_white.png` — for light backgrounds
- **Component library:** shadcn/ui on Radix UI primitives
- **Font:** System sans-serif (Tailwind default)
- **Animations:** tailwindcss-animate

---

## Parallel Execution (C Core)

The C core supports two execution modes:

**CPU mode (pthreads):**
- Thread pool sized to available cores
- Used for: transaction validation, signature verification, DB ops

**GPU mode (CUDA/HIP):**
- Primary: CUDA (NVIDIA)
- Portability: HIP wrapper so kernels can target AMD ROCm or other backends
- Used for: block validation, hash computation, bulk signature verification
- Runtime selection: `--mode cpu` or `--mode gpu` flag, or `SCOOT_MODE` env var

---

## Build Phases

### Phase 1 — Web foundation (do first)
- [ ] Scaffold client (Vite + React + Tailwind, port scoot0430 style)
- [ ] Scaffold server (Express + Passport + Drizzle + WebSocket)
- [ ] Auth: register/login/logout with sessions
- [ ] Chat: rooms, messages, live WebSocket delivery
- [ ] Stub all Scoot and Bot endpoints (mock responses)
- [ ] Basic media upload (images only)

### Phase 2 — C core integration
- [ ] Implement scootd Unix socket daemon (skeleton)
- [ ] Implement C bridge in Node server
- [ ] Wire Scoot wallet endpoints to real C core
- [ ] Transaction history and send

### Phase 3 — Blockchain
- [ ] Block structure, chain, genesis block in C
- [ ] CPU-parallel validation
- [ ] CUDA kernel for hash/validation

### Phase 4 — Bot + media
- [ ] Wire bot endpoints to LLM provider abstraction (Claude API first)
- [ ] Protected video player with HLS
- [ ] File uploads

### Phase 5 — Mobile
- [ ] React Native (Expo) — iOS first
- [ ] Android second

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/scoot

# Session
SESSION_SECRET=<random 64 char string>

# C core socket
SCOOTD_SOCKET=/tmp/scootd.sock

# LLM provider: "anthropic" | "openai_compat"
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-...
LLM_MODEL=claude-sonnet-4-20250514
# To switch to vLLM or any OpenAI-compatible backend:
# LLM_PROVIDER=openai_compat
# LLM_API_URL=http://your-host:8000/v1
# LLM_MODEL=meta-llama/Llama-4-...

# Media storage
MEDIA_DIR=/var/scoot/media
MEDIA_BASE_URL=https://yourserver.com/media

# Server
PORT=3000
NODE_ENV=development
```
