// The "rules" SMS command. The real risk here isn't the happy path — it's
// hijacking ordinary chatter, so most of this covers what must NOT match.
// No DB: the command reads env and hands off to throttledSend, so a fake
// SMS provider (provider.ts's setProvider seam) captures what went out.
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setProvider, type SMSProvider } from "./provider.js";
import { tryHandleRulesCommand } from "./rules-commands.js";

const PAGE = "https://example.org/fonde-rules/";
const IMG = "https://example.org/fonde-rules/rules-1-p1.jpg";
const PHONE = "+15550001111";

let sent: Array<{ phone: string; body: string; media?: string[] }>;
let restoreProvider: (() => void) | null = null;
let prevPage: string | undefined;
let prevImgs: string | undefined;

const fakeProvider = {
  async send(to: string, body: string, mediaUrl?: string[]) {
    sent.push({ phone: to, body, media: mediaUrl });
    return { sid: `SM-test-${sent.length}`, status: "queued" };
  },
  validateInboundSignature: () => true,
  parseInbound: () => {
    throw new Error("not used");
  },
} as unknown as SMSProvider;

beforeEach(() => {
  prevPage = process.env.RULES_PAGE_URL;
  prevImgs = process.env.RULES_IMAGE_URLS;
  process.env.RULES_PAGE_URL = PAGE;
  process.env.RULES_IMAGE_URLS = `${IMG}, https://example.org/fonde-rules/rules-1-p2.jpg`;
  sent = [];
  restoreProvider = setProvider(fakeProvider);
});

afterEach(() => {
  restoreProvider?.();
  restoreProvider = null;
  if (prevPage === undefined) delete process.env.RULES_PAGE_URL;
  else process.env.RULES_PAGE_URL = prevPage;
  if (prevImgs === undefined) delete process.env.RULES_IMAGE_URLS;
  else process.env.RULES_IMAGE_URLS = prevImgs;
});

describe("rules command", () => {
  it("sends the sheet for a bare keyword, in any casing", async () => {
    for (const body of ["rules", "Rules", "RULES", "rules?", "the rules", "Rules of the Game"]) {
      sent = [];
      const reply = await tryHandleRulesCommand(PHONE, body);
      assert.equal(reply, "", `"${body}" should be handled by the MMS itself`);
      assert.equal(sent.length, 1);
      assert.ok(sent[0].body.includes(PAGE), "reply carries the web link");
    }
  });

  it("sends exactly one image even when several are configured", async () => {
    await tryHandleRulesCommand(PHONE, "rules");
    assert.deepEqual(sent[0].media, [IMG]);
  });

  it("leaves ordinary chatter to BigMo", async () => {
    for (const body of [
      "what are the rules on subs?",
      "no rules today",
      "gym rules",
      "rules are rules",
      "send me the rules please",
    ]) {
      const reply = await tryHandleRulesCommand(PHONE, body);
      assert.equal(reply, null, `"${body}" must fall through`);
    }
    assert.equal(sent.length, 0);
  });

  it("falls back to the link when no image is configured", async () => {
    delete process.env.RULES_IMAGE_URLS;
    const reply = await tryHandleRulesCommand(PHONE, "rules");
    assert.equal(reply, `Fonde rules: ${PAGE}`);
    assert.equal(sent.length, 0, "no empty MMS");
  });

  it("says so plainly when nothing at all is configured", async () => {
    delete process.env.RULES_IMAGE_URLS;
    delete process.env.RULES_PAGE_URL;
    const reply = await tryHandleRulesCommand(PHONE, "rules");
    assert.match(reply ?? "", /don't have the rules sheet/i);
    assert.equal(sent.length, 0);
  });
});
