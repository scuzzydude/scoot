# Scoot — IP / Design Claims

**Author:** Brandon Awbrey  
**Project:** Scoot (SW) — Recursive Integration demonstration  
**Current build target:** Scoot(34) = The Dream Laboratory (Fonde Brotherhood)

---

## Core Claim

Scoot is a social platform structured around the *scoot* primitive — a governed, trust-weighted community with its own value system, currency, and identity graph. The platform is designed to host many independent Scoots, each with its own term overrides, charter, and membership rules, running on a shared technical substrate.

The foundational IP is the Asimov system (see `asimov_v2.13.md`). Scoot is its first software implementation.

---

## Identity Primitive — The Staking Ritual

A → B stake is an in-person ceremony:

1. A generates a QR code
2. B scans it (first scan: initiates)
3. A receives a one-time code, shares it with B verbally
4. B enters the code and scans again (second scan: confirms)
5. A selfie is captured and stored as pledge proof

The resulting edge in the trust graph is *not* a follow or friend — it is a pledge. It carries weight, creates obligation, and is the primitive from which scootage (community membership) is computed.

**Why this matters:** Most social graphs are cheap (click to follow). The Scoot trust graph is expensive by design. The in-person ceremony creates a physical attestation of the relationship. The selfie is the receipt.

---

## Value System — Scoot Currency

- Every member has a wallet with a Scoot balance
- Scoot is not traded on an exchange — it is earned within a Scoot community through participation
- Transactions flow over the scootchain — a lightweight custom blockchain owned by the `scootd` C daemon
- The Node API layer never implements blockchain logic — all wallet operations go through the C bridge

---

## Multi-Scoot Architecture

- The platform hosts N independent Scoots, each identified by `Scoot(X)` where X is an integer
- Each Scoot has its own: membership, term overrides (e.g. "Starter" for trustee in Scoot(34)), charter, and governance rules
- Code, schema, and API use canonical Scoot vocabulary (`pledge`, `scootage`, `trustee`, `scoot`, `asimov`)
- UI renders per-Scoot label maps — never hardcoded to Scoot(34) display strings
- Scoot(34) = The Dream Laboratory / Fonde Brotherhood — first and currently only active Scoot

---

## LLM Bot Layer

- Bots are first-class users in the system (`is_bot = true`)
- Each bot has a personality stored in the `bots` table
- `@mention` in a chat message triggers the bot
- All LLM calls go through a provider abstraction (`/server/llm/provider.ts`) — never directly from routes
- Supported backends: Anthropic API, OpenAI-compatible (vLLM, Ollama, etc.)
- This makes the platform a hybrid social + AI environment within a trust-governed community

---

## Prior Art / Reference

- `asimov_v2.13.md` / `asimov_v2.13.pdf` — Brandon Awbrey's full Scoot / Foundation / Asimov system design book (335 pages)
- Key sections: Scoot Primer (~line 737), Appendix D System Technical Description (~line 8571)
