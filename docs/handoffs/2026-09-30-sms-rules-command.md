# Handoff — SMS "rules" command (BigMo texts the rules sheet)

**From:** session positioned at `scoots/scoot34` (info sheet / rules documents).
**To:** whoever owns `ri/src/server/sms/**` (strict path — this session is not the owner).
**Asked for by:** Brandon, 2026-09-30 — "Make it so if user texts 'rules' you'll send the rules."

## What it should do

A Brother texts `rules` → BigMo replies with the Fonde Senior Basketball rules sheet as an
MMS image, plus the web link. Whole-message keyword match only, same convention as the rest
of the SMS command surface (§8.3), so ordinary chatter that mentions rules is never hijacked
and still reaches the LLM.

Source of the sheet (already published, no new pipeline needed):

- page: https://fairchildlabs.org/fonde-rules/
- page 1 image (the numbered rules): https://fairchildlabs.org/fonde-rules/rules-12-p1.jpg
- page 2 image (proposed / special situations): https://fairchildlabs.org/fonde-rules/rules-12-p2.jpg

Send **one** image (page 1) + the link, not two. Two-media MMS to Brandon's phone was accepted
and reported `delivered` by Twilio but took minutes to settle; single-image sends settle in
seconds. Page 2 is proposals, not rules, so the link covers it.

Both URLs carry a draft number and change with every revision — hence env vars, not constants.

## New file: `ri/src/server/sms/rules-commands.ts`

```ts
// "rules" over SMS — texts the Fonde Senior Basketball rules sheet.
// Explicit-keyword-only, whole-message match (§8.3, same as card-commands.ts /
// trust-commands.ts): a Brother asking "what are the rules on subs?" still
// reaches BigMo, only a bare "rules" triggers the sheet.
//
// The sheet is a versioned document (fairchildlabs.org/fonde-rules/, draft N),
// so its URLs live in env, never in code:
//   RULES_PAGE_URL   — the web page for the current draft
//   RULES_IMAGE_URLS — comma-separated fully-qualified image URLs (MMS: Twilio
//                      fetches these server-side, so a relative path is useless)
// Env is read at container creation, NOT by tsx watch — bumping a draft means
// `docker compose -f ri/physical/docker-compose.yml up -d app` (same gotcha as
// MEDIA_BASE_URL, see memory bigmo_mail_poller).
import { throttledSend } from "./send.js";
import { log } from "../log.js";

const RULES_PATTERN = /^(rules|the rules|rule sheet|rules of the game)\??$/i;

export async function tryHandleRulesCommand(
  phone: string,
  trimmed: string,
): Promise<string | null> {
  if (!RULES_PATTERN.test(trimmed)) return null;

  const page = (process.env.RULES_PAGE_URL ?? "").trim();
  const media = (process.env.RULES_IMAGE_URLS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!media.length) {
    // Nothing configured — say so plainly rather than sending an empty MMS.
    log.warn("rules command: RULES_IMAGE_URLS unset");
    return page
      ? `Fonde rules: ${page}`
      : `Don't have the rules sheet in front of me right now.`;
  }

  const body = page
    ? `Fonde Senior Basketball — the rules. Full sheet: ${page}`
    : `Fonde Senior Basketball — the rules.`;
  await throttledSend(phone, body, [media[0]]);
  log.info({ phone }, "bigmo sms rules sheet sent");
  return ""; // the MMS carries it; no second reply
}
```

## Dispatch: `ri/src/server/sms/bigmo.ts`

Insert directly after the player-card block (it reads as another "send me a thing I
already have" lookup, and must land before the write-command / routing / LLM paths):

```ts
    // "rules" → text the Fonde rules sheet (MMS + link). See rules-commands.ts.
    const rulesReply = await tryHandleRulesCommand(phone, trimmed);
    if (rulesReply != null) {
      log.info({ phone, sender: sender.username }, "bigmo sms rules command");
      return finish(rulesReply, roomId);
    }
```

plus the import alongside the other command imports:

```ts
import { tryHandleRulesCommand } from "./rules-commands.js";
```

## Env

`.env` (prod) and `.env.example` both gain:

```
RULES_PAGE_URL=https://fairchildlabs.org/fonde-rules/
RULES_IMAGE_URLS=https://fairchildlabs.org/fonde-rules/rules-12-p1.jpg
```

Applying this needs an `up -d app` (container recreate), not just a `tsx watch` reload.

## Tests

`ri/src/server/sms/rules-commands.test.ts` — the surface is small and the risk is
hijacking normal chatter, so cover:

- bare `rules`, `Rules`, `rules?`, `the rules` → handled (returns "" and sends one MMS)
- `what are the rules on subs?`, `no rules today`, `gym rules` → returns null (falls to BigMo)
- `RULES_IMAGE_URLS` unset → returns the link text, sends nothing

## Notes for the owner

- BigMo still knows nothing about the rules themselves; this hands over a picture. Teaching
  the bot to answer "how long are the games?" is a separate change in
  `ri/personalities/bigmo/cotb.md` and should wait until the rules stop moving (draft 12
  as of 2026-09-30, still gaining rules).
- A2P: the registered campaign use case is still 2FA only (see memory
  `twilio_a2p_10dlc_registration`). This adds another non-2FA message type to production
  traffic. Not a blocker, but it belongs in the same pile as the schedule-notice work.
