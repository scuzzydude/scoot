# Pass 1 — Behavioral Model

**Project:** Scoot  
**Pass:** 1 — What does the system do?  
**Status:** In progress — to be formally closed before Pass 2 scope expands

---

## Entry Criteria (from prior pass)

This is Pass 1 — no prior pass. Entry criterion: Chief Engineer has defined the IP and design claims.  
See `ip/inventions/scoot_design_claims.md`.

## Exit Criteria (what must be true to close Pass 1)

- [ ] Every feature has a stated behavioral contract (inputs, outputs, invariants)
- [ ] Scoot(X) multi-tenancy model is stated at the behavioral level
- [ ] Trust graph and staking primitive are defined behaviorally (not as code)
- [ ] API surface is enumerated (not implemented — just named and contracted)
- [ ] Pass 1 reviewed and approved by Chief Engineer

---

## System Boundary

Scoot is a social platform. It has four subsystems:

| Subsystem | What it does |
|---|---|
| **Identity** | Users, trust graph (staking), Scoot membership |
| **Chat** | Real-time messaging, rooms, media, bots |
| **Wallet** | Scoot currency: balances, send/receive, scootchain |
| **Bot** | LLM-powered bot users triggered by @mention |

External interfaces: browser (HTTPS), WebSocket (live chat), optional S3-compatible media store, optional vLLM/Ollama endpoint.

---

## Feature Behavioral Contracts

### Identity

**Register**
- Input: username, password, email
- Output: user record created, session established
- Invariant: username is globally unique; password is hashed before storage

**Login / Logout**
- Input: username + password
- Output: session created / session destroyed
- Invariant: sessions are server-side; client holds only a session cookie

**Stake A → B**
- Input: A initiates QR; B scans; A issues one-time code; B confirms; selfie captured
- Output: directed pledge edge A→B created in trust graph; selfie stored as proof
- Invariant: the ceremony requires physical co-presence; one-time code expires after use; pledge cannot be self-directed

**Scoot membership**
- Derived from the trust graph — scootage is the computed community membership
- A user belongs to a Scoot when their pledge graph connects them to the Scoot's trust anchor
- Invariant: membership is not manually assigned — it is earned through the graph

---

### Chat

**Send message**
- Input: authenticated user, room ID, text content (and/or media)
- Output: message persisted, delivered in real-time to all room members via WebSocket
- Invariant: sender must be a member of the room; messages are ordered by server timestamp

**@mention bot**
- Input: message containing `@botname`
- Output: bot receives message, LLM generates reply, reply delivered as bot's message
- Invariant: bot reply is attributed to the bot user; typing indicator shown while generating

**Room membership**
- Input: user ID + room ID
- Output: user added to room; they receive subsequent messages
- Invariant: rooms are persistent; members persist across sessions

---

### Wallet

**Get balance**
- Input: authenticated user
- Output: current Scoot balance
- Invariant: balance computed by scootchain; Node API never holds authoritative balance state

**Send Scoot**
- Input: sender, recipient, amount
- Output: transaction submitted to scootchain, balance updated
- Invariant: sender must have sufficient balance; transaction is signed by sender; all operations go through scootd C daemon via Unix socket

---

### Bot

**Bot personality**
- Each bot has a name, system prompt, and LLM provider config stored in `bots` table
- Invariant: bots are users in the system; `is_bot = true` distinguishes them

**LLM provider abstraction**
- Input: message array + optional system prompt
- Output: completion string
- Invariant: route code imports only the `LLMProvider` interface; provider implementation selected by `LLM_PROVIDER` env var

---

## Multi-Scoot Tenancy Model

- The system hosts N Scoots identified as `Scoot(X)`
- Each Scoot has: a name, a term label map, a charter, a membership set, a trust anchor
- Canonical vocabulary is always used in code and schema
- UI renders via per-Scoot label map; if no override exists, canonical term is shown
- Current active Scoot: Scoot(34) = The Dream Laboratory (Fonde Brotherhood)
  - Term overrides: trustee → "Starter", scootage → "Fonde Brotherhood"

---

## API Surface (enumerated, not implemented)

| Method | Path | Description |
|---|---|---|
| POST | /api/auth/register | Create user |
| POST | /api/auth/login | Login |
| POST | /api/auth/logout | Logout |
| GET | /api/auth/me | Current user |
| GET | /api/chat/rooms | List rooms |
| POST | /api/chat/rooms | Create room |
| GET | /api/chat/rooms/:id/messages | Message history |
| POST | /api/chat/rooms/:id/messages | Send message |
| GET | /api/chat/rooms/:id/members | Room members |
| POST | /api/chat/rooms/:id/members | Add member |
| GET | /api/wallet/balance | Get Scoot balance |
| POST | /api/wallet/send | Send Scoot |
| GET | /api/scoots | List Scoots |
| GET | /api/scoots/:id | Get Scoot detail |
| POST | /api/stake/initiate | Begin staking ceremony |
| POST | /api/stake/confirm | Complete staking ceremony |
| WS | /ws/chat/:roomId | Real-time chat stream |

---

## What Pass 1 Does NOT Include

- Implementation (that is Pass 2 / `ri/src/`)
- Test cases (that is Pass 3 / `ri/sim/`)
- Performance targets or latency budgets (Pass 4 / validation)
- Deployment topology (Pass 5 / `ri/physical/`)
