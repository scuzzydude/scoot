// "rules" over SMS — texts the Fonde Senior Basketball rules sheet.
// Explicit-keyword-only, whole-message match (§8.3, same convention as
// card-commands.ts / trust-commands.ts): a Brother asking "what are the rules
// on subs?" still reaches BigMo, only a bare "rules" sends the sheet.
//
// The sheet is a versioned document (fairchildlabs.org/fonde-rules/, draft N),
// so its URLs live in env, never in code:
//   RULES_PAGE_URL   — the web page for the current draft
//   RULES_IMAGE_URLS — comma-separated fully-qualified image URLs (MMS: Twilio
//                      fetches these server-side, so a relative path is useless)
// Env is read at container creation, NOT by tsx watch — bumping a draft means
// `docker compose -f ri/physical/docker-compose.yml up -d app` (same gotcha as
// MEDIA_BASE_URL).
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
    // Nothing configured — say so plainly rather than send an empty MMS.
    log.warn("rules command: RULES_IMAGE_URLS unset");
    return page
      ? `Fonde rules: ${page}`
      : `Don't have the rules sheet in front of me right now.`;
  }

  // One image only: two-media MMS took minutes to settle where singles land in
  // seconds, and page 2 is proposals, not rules — the link covers it.
  const body = page
    ? `Fonde Senior Basketball — the rules. Full sheet: ${page}`
    : `Fonde Senior Basketball — the rules.`;
  await throttledSend(phone, body, [media[0]]);
  log.info({ phone }, "bigmo sms rules sheet sent");
  return ""; // the MMS carries it; no second reply
}
