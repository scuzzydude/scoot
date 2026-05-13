---
name: Scoot conceptual model — what we're actually building
description: The Foundation / Scoot / asimov / pledge system from Brandon's book — the design vocabulary that should drive feature decisions
type: project
originSessionId: 1c342db8-8696-42a2-ac30-2ce9d2edcf97
---
The Scoot system is described in full in `docs/reference/asimov_v2.13.md` (Appendix D especially, ~line 8571; Scoot Primer at ~line 737). This is the mental model — read it before designing identity, governance, wallet, or social features. The blockchain ("scootchain") is NOT in v1, but every feature should fit this vocabulary so future chain integration is just a backend swap.

## Current build target: Scoot(34) — The Dream Laboratory

We are building Scoot(34), the first (and currently only) Scoot in the system. Its real-world identity:

- **Subject of appreciation:** creative dreams / dream-pursuit itself (active appreciation — experimenting, helping each other chase dreams — not curating a dead genius).
- **Scootage:** the Fonde Brotherhood — Brandon's basketball brotherhood, anchored at Fonde Rec Center, Houston (the Hakeem-era pickup-basketball mecca).
- **Trustees:** call themselves Starters (basketball lingo).
- **Social manifestation:** in-person pickup basketball.

The app must be structured to host MANY Scoots (pickleball league is a candidate next target), not be hardwired to Scoot(34).

## Vocabulary overload — per-Scoot term renaming

**Canonical Scoot terms are used in code, schema, API, and internal docs.** UI rendering goes through a per-Scoot label map so each Scoot can speak its own vernacular. Defaults to canonical when no override.

Examples for Scoot(34):
- `trustee` → "Starter"
- `scootage` → "Fonde Brotherhood"
- `pledge` → (TBD, possibly "Brother")
- `scoot` (the token) → (TBD, Scoot decides)

For the pickleball Scoot it would be different terms entirely.

Implementation direction (not built yet): config file per Scoot mapping canonical → display labels. Eventually becomes part of the charter block on the scootchain (book: "A Scoot shall have a written charter… executable by the protocol"). For now, a static config / DB row is fine.

**Rule of thumb:** if you're writing backend code, schema, or API responses, use canonical terms. If you're writing a string the user reads, route it through the term map.

## Core entities (canonical vocabulary)

- **The Foundation** — single global NGO, central human authority. Itself a Scoot. Validates pledges, registers Scoots, mints asimov. Our seeded root user (`scuzzydude`/`rocketman`) represents the Foundation seed.
- **Scoot (uppercase)** — an enterprise/club focused on appreciating ONE idea or legacy. NOT property. Cannot own real estate. Identified by integer index: `Scoot(X)`.
- **scoot (lowercase)** — the token of responsibility a holder of a Scoot holds. NOT stock, NOT asset, NOT NFT. Holders have one right (elective governance) and one duty (grow appreciation of the Scoot's subject).
- **asimov** — scoot(0). Only scoot the Foundation mints. Acts as the value index across all Scoots. Only scoot allowed in the value domain.
- **Pledge** — a human member of the Foundation. Must be a unique human. Identified by biometric OR linked-stake (our in-person ritual). NOT organizations, NOT bots. Maps to `users` with `is_bot=false`.
- **Scootage** — collective term for the holders of a specific scoot. Not "users" or "members" generically — `scootage of Scoot(34)`.
- **Scoot Trustee** — elected/chosen leader of a Scoot. Method of election is per-Scoot but must be protocol-executable.

## Two domains (real UX implications)

- **Responsibility Domain** — closed. scoot trades require **both-party validation** — the recipient must ACCEPT the responsibility, not just receive it. Only pledges and trustees can be nodes. No fiat, no crypto.
- **Value Domain** — open. asimov trades freely (like bitcoin), bridges to fiat/crypto/property.

## Hard rules that shape features

1. **Scootage never receives income/dividend.** A Scoot can earn income, but may only spend on appreciation (educational, derivative, inspirational, buybacks, acquiring related scoot). Direct transfer to holders = permanent ban from responsibility domain. Affects any future revenue/payment feature.
2. **Scoot may never own real property.** Can buy Property of Wealth (non-real — famous paintings etc.) but must immediately gift to humanity. Cannot sell. Cannot use as collateral.
3. **Pledges are real humans only.** Bots cannot be pledges, hold scoot, vote, or appear in trustee elections. Our `is_bot` flag already encodes this.
4. **The Foundation can roll back chains.** This is by design and is why Scoot is "not crypto." DB layer should be audit-friendly + reversible, not chase blockchain-style immutability.

## Identity / handle model (already partly aligned)

- **TPH (True Pledge Handle)** — resolves to ID + country via Foundation API.
- **PPH (Pseudonymous Pledge Handle)** — anonymous address, doesn't resolve.
- Existing `username` + `display_name` split aligns: username is canonical (TPH-like), display_name is what's shown. Pseudonymity is a first-class feature, not a bug.

## Staking — connects to existing memory

The book's "linked stakes" IS the in-person QR + code + selfie ritual already in `social_graph_staking.md`. Two flavors:
- **Pledge-stakes-pledge** (humanness vouching) — v1.
- **Pledge-stakes-Scoot** (committing asimov to reduce a new Scoot's registration cost) — deferred.

## Shun (deferred but worth knowing)

Pledges/Scoots can refuse interaction with another. Inverse of responsibility tree = hypocrisy tree. Relevant when room/DM gating is designed — shun is the formal "no contact" predicate.

## NOT in v1 (but reserve schema/API room for these)

- Scootchain (per-Scoot blockchain)
- Mining rewards: scoot(-1), scoot(-2)
- Staking networks (Scoots processing each other's transactions)
- SNS (Scoot Naming System)
- Property of Wealth custody features
- Cross-Scoot trades

## How to apply

- **Code/schema/API:** canonical vocabulary always (`pledge`, `scootage`, `trustee`, `scoot(X)`, `asimov`). Avoid generic `user`/`member`/`admin`/`owner` in new code.
- **User-facing strings:** route through the per-Scoot term map. For Scoot(34) the scootage sees "Starter" and "Fonde Brotherhood", not "Trustee" and "Scootage".
- **Transfer/wallet UX:** model two-party acceptance, not one-party send.
- **Roles:** there is no "owner" — only trustee (singular, elected) and scootage (collective).
- **Multi-Scoot from day one:** never hardwire to Scoot(34). All queries scoped by Scoot index.
- When in doubt, read `docs/reference/asimov_v2.13.md`.
