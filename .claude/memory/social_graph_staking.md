---
name: Social graph — staking for humanness via in-person pledge ritual
description: How users stake each other (QR + code + selfie ritual) and what that implies for chat/wallet/bot design
type: project
originSessionId: 30c264ac-2abc-4e83-9020-c83e0856f83f
---
Scoot is member-only and small at first, may grow. Pseudonymity is allowed — real identities are not required. The platform doesn't need to know who you really are, but it tracks who has vouched that you're a person.

## The pledge ritual (how staking actually happens)

Staking is an in-person ceremony between an existing user (the *staker*, A) and a prospect (the *stakee*, B). It cannot be performed remotely.

1. **A generates a QR code** on their device.
2. **B scans A's QR**, opening a pledge-in-progress on B's side.
3. **A speaks a one-time code aloud.** B **types it into B's phone**, which transmits the typed code back to A's phone for verification. A confirms the match. This proves real-time co-presence (B heard the spoken code and entered it on B's own device). *Note: this exact flow is provisional — may be revised. The intent is "A's voice + B's input + A's verification" so a screen-scraped QR alone is insufficient.*
4. **A second scan** completes the cryptographic handshake (likely A scans a QR B now presents).
5. **A takes a selfie with B.** This selfie is saved permanently in A's **"staked pledges"** listing.
6. **B is now staked-by-A.** B can subsequently stake others, building out a chain of trust.

Acknowledged: the verbal-code step is not perfectly secure if the staker is willing to cheat (e.g. relays the code remotely). The system trusts the staker as the human-in-the-loop verifier — see "Real-world context" below.

The result is a **directed graph** (often tree-like, but cycles possible): every staked user can be traced back through one or more stakers to earlier members. The chain is the trust artifact.

## Real-world context (why the ritual works this way)

Scoot operates out of a city rec center. People drop in, get staked, and may not be seen again for *years* before reappearing. The community is intermittent and partly anonymous.

**The selfie exists to solve a specific problem: the staker's own memory.** It is *not* primarily a public proof of pledge. When user X comes back after three years and says "hey, you staked me," the staker needs to be able to look at their staked-pledges list, see X's selfie next to their face today, and confirm "yes, I remember this person, I vouched for them."

This shapes several design decisions:
- **The selfie's audience is the staker first.** Default visibility should be private-to-staker (and probably the stakee themselves). Wider visibility is a separate, opt-in feature.
- **Selfies must be durable.** They need to survive years of storage and remain recognizable.
- **The staker is the human-in-the-loop verifier.** For now, "is this a real human" is determined by the staker physically meeting the prospect and forming a personal judgment. The platform does not try to verify humanness independently — it trusts the staker's eyes.
- **The verification standard is broad: not AI, not bot, not non-human biological.** The staker is asserting "I was in the same room as this person and they are a human being." That's the bar. No identity verification beyond that.

## Design implications

- **Trust/visibility decisions** (who can DM whom, who can join rooms, what the bot trusts) should be driven by the staking graph — distance from a known root, depth of stakers, etc. — not by usernames or emails.
- **The bot lives in chat alongside humans.** Staking is how a human proves they're not another bot. Bots are not stakeable.
- **The Scoot token is the obvious collateral.** Stakers may risk Scoot when they pledge — bad pledges (later revoked) could slash. This ties wallet directly to social graph.
- **Selfies are first-class data, and private by default.** Pledge selfies live in the staker's private list — they are not public attestations. Storage, display, and access control must reflect "the staker is the audience" — wider visibility is opt-in only.
- **Onboarding requires physical access to an existing member.** No self-serve signup beyond the seeded root user(s). The auth lock-down (registration disabled, default user seeded) already aligns with this.
- **Room privacy / DM gating should be expressible in graph terms** ("staked by someone in this room", "≤ 2 hops from member X", "any staked user") — not just static member lists.
- **No heavy identity/KYC flows.** Pseudonymity is a feature; the pledge ritual replaces KYC for the "is human" question.

## Revocation

Revocation rules depend on whether the pledge was a valid humanness assertion or not:

- **If the pledge represents a confirmed human** (the staker did meet a real person and validated them): revocation is restricted. Either (a) **admin-only**, or (b) **both the staker AND the staker's own staker must agree**. Open: pick one of these or allow either path. The intent is that you can't casually un-vouch for a confirmed human — that's a serious action that should require either platform-level authority or a small consensus up the chain.
- **If the pledge was bogus** — the staker was tricked (the prospect wasn't actually human / wasn't unique), or the staker didn't follow the ritual rules — **revocation is freely allowed.** This path exists to clean up mistakes and rule-breaking without needing consensus.

The data model needs to capture *which kind* of revocation a pledge supports at revoke-time (i.e. a "humanness was confirmed" flag, or the ability to reclassify a pledge as bogus before/at revocation).

Downstream impact of revocation on the staking graph (do B's own pledges get weakened? cascade-revoked? unaffected?) is an open question — defer until building the staking-gated chat/wallet features.

## Root of trust

**Single global root** — currently user `scuzzydude` (the developer). May be renamed to `rocketman` later. There is exactly one root staker for the platform; all other members trace their pledge chain back to this root.

This aligns with the existing auth lock-down: registration is disabled, the default user is seeded from env vars (`49be5be`), and that seeded user *is* the root.

## Handle model (open)

Considering a **two-handle system**:
- **Login handle** — stable, identity-bearing, used for auth and as the canonical user identifier in the staking graph.
- **Alias / message handle (nickname)** — display name shown in chat, mutable, may be changed without affecting identity or pledges.

This is not decided yet. If adopted, the schema needs `username` (login) + `display_name` (alias) on the users table, and chat UI should render the alias while staking/admin views render the login handle.

## How to apply

- When designing chat scope: model permissions as graph queries against the staking graph, not as role tables.
- When designing wallet scope: leave room for stake transactions (lock/escrow Scoot against another user) and for slashing on revoked pledges.
- When designing room membership: visibility rules should accept graph predicates as first-class inputs.
- When building features that involve user-to-user trust, ask "could this be expressed via staking?" before adding admin/moderator flows.
