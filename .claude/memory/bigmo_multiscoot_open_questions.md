---
name: bigmo_multiscoot_open_questions
description: Open design thread — BigMo behavioral/capability/audience rules for Scoot(34) + multi-Scoot AI personalities
metadata: 
  node_type: memory
  type: project
  originSessionId: 33fe06ac-1a6e-4046-afff-7a89f2da62c7
  modified: 2026-07-28T16:42:53.159Z
---

2026-07-28: Brandon wants to define more rules for BigMo (Scoot(34)'s bot) and floated the idea of different AI personalities — or multiple AIs — per Scoot(X) as the platform grows beyond one Scoot. Asked to review whether the idea makes sense before building anything. **Never got to the actual new rules — session pivoted into the [[scoot_currency_ledger]] design instead.** Pick this back up directly next time; don't re-litigate the architecture review below.

**Architecture assessment (still valid, don't re-derive):**
- The multi-bot *mechanism* already works and generalizes fine: `bots` is a real table (one row per bot user), matched by `@username` mention in `bot-mentions.ts`, each with its own `systemPrompt` + a personality file at `ri/personalities/<username>/personality.md`. A room can already host multiple distinct bots. Adding a second AI personality is mostly "seed another bot row," not a redesign.
- What's actually missing for real multi-Scoot AI: neither `bots` nor `chatRooms` has a `scootId` column. Everything is one global namespace today — invisible because Scoot(34) is the only Scoot that exists. `chatRooms.scootId` was already a known gap before this (oversight queries return "all rooms," harmless with one Scoot, wrong with two). Don't build this speculatively — CLAUDE.md's own philosophy says structure for many Scoots without hardwiring, i.e. wait until a second Scoot is actually imminent.
- `bigmo_shutdown` (the SMS kill switch) is fine staying global/singleton even in a multi-bot future — it's an operator safety switch, not a personality concern.
- Noticed BigMo's own personality.md (line 115, Full AI Mode section) already says it can answer questions about "schedule, courts, headcount, **tokens**" — ambiguous whether that means LLM usage-token tracking (Phase 3) or scoot(34) currency balances. Now that [[scoot_currency_ledger]] exists, worth resolving: should BigMo be able to answer real balance/transaction questions once the ledger is live? That's exactly the "capability rules" bucket Brandon flagged wanting to discuss.

**Still unanswered — ask again next session:** what was the actual trigger for wanting new BigMo rules right now? (Something it did wrong, a gap noticed, or just getting ahead of the ledger work?) Brandon selected all four categories (behavioral/tone, capability, per-audience, "let's just talk it through") — this is a genuinely open-ended design conversation, not a specific bug report.

**2026-08-16 addition — templates/cards via BigMo, eventually:** Brandon is building manga/superhero-style basketball cards for players (extracted video frames → card art, see the "Nick get-well video" media-pipeline work, separate memory to follow). Card/template creation happens through Claude Code for now. Stated intent: **eventually BigMo's SMS text interface should let Brotherhood members work with these templates too** — not just an app/Claude-Code-only workflow. No design done yet (what "work with a template over SMS" even means — request a card? approve a draft? pick a style? — is undefined). Fold into the capability-rules discussion above when it resumes; this is another concrete data point for "what should BigMo be able to do."

Related: [[scoot_currency_ledger]], [[chat_bots_design]], [[project_plan]], [[scoot_concept_model]].
