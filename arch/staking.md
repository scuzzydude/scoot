# Staking Ritual — Phase 4 (v1, SMS-driven)

Status: **built, v1.** Supersedes the Phase 2 stub (`routes/staking.ts`, global
`UserFlags.STAKED`) — removed. See `ip/inventions/asimov_v2.13.md` / the
`social_graph_staking` design memory for the full original ceremony (QR + live
device handshake); this v1 is a deliberately simplified SMS-only version.

## Flow

1. **Prospect** texts BigMo `stake` (or `stake me`) — works for a totally new
   phone number; this IS how a brand-new prospect gets a `users` row at all (no
   self-serve signup otherwise). BigMo creates a placeholder user (phone only,
   no password) if needed and replies with a 5-digit code (`staking_codes`,
   24h expiry).
2. Prospect hands/tells the code to an **in-person staked member** (the staker).
3. **Staker** texts BigMo `stake <code>`. BigMo checks the staker is themselves
   staked, and the code is valid/unused/unexpired, then starts a **multi-turn
   Q&A** (never one rigid all-in-one message — that's exactly what trips up the
   members this is for):
   - *"Send me a photo of you two together."* — a bare photo (no caption needed)
     advances the flow. This selfie is evidentiary: a paper trail for the rare
     "mystery hooper turned out to be a scammer" case, not primarily public.
   - *"Is \[name\] a senior (55+), an OG (70+), or just a regular member?"* — the
     staker replies with a tier word (`senior`/`sr`/`55`, `og`/`70`,
     `member`/`regular`/`no`/`skip`). Unrecognized replies re-ask; `cancel` at
     any point abandons the flow with nothing changed.
4. On a valid tier reply: `scoot_members.userFlags` gets `STAKED` (+ the tier
   bit if any), the code is marked used, and a `pledges` row is inserted
   (`stakerId`, `stakeeId`, `selfieUrl`, `stakingCode`).

State for an in-progress Q&A lives in `sms_state.pending` (`kind: "stake_flow"`),
the same column §4/§8.5 routing uses for its own confirm/undo state — both share
one discriminated union (`sms/pending.ts`) so the two flows can't stomp each
other for the same user.

## Age tiers — no birthdate ever stored or computed

`ScootFlags.SENIOR` (1<<8=256, 55+) and `ScootFlags.OG` (1<<9=512, 70+) are
**attested directly by the staker** — the system never asks for or stores a
birth year/date for this. The 55/70-by-birth-**year** rule (flips Jan 1, not on
an actual birthday) is the rule the staker applies mentally in the field; BigMo
only ever sees the resulting tier (surfaced in the "who you're texting with"
persona line), never a birthdate — consistent with the platform's broader
no-LLM-date-math posture (see `bigmo_no_llm_time_math` memory / `llm/schedule.ts`).
Neither bit set = regular member. The bits are mutually exclusive in practice
(OG supersedes senior); nothing enforces that at the DB level.

## Deliberately deferred vs. the original design

- **Live QR/device handshake** — replaced by the SMS code+photo+Q&A above.
- **Trust graph traversal / distance-from-root queries** — `pledges` records the
  edges; nothing yet computes chains or gates features on graph distance.
- **Revocation** — no revoke path yet; the design memory's confirmed-human vs.
  bogus-pledge distinction is unbuilt.
- **Root of trust** — `rocketman` (user id 1) is the de facto root per this
  session's user-id reservation work, but nothing encodes that formally yet.
