import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractMentions, buildProviderMessages, MENTION_REGEX } from "./bot-mentions.js";

describe("extractMentions", () => {
  it("returns empty array when no @ in content", () => {
    assert.deepEqual(extractMentions("hello world"), []);
  });

  it("matches a mention at start of message", () => {
    assert.deepEqual(extractMentions("@claude what time is it"), ["claude"]);
  });

  it("matches a mention mid-sentence after whitespace", () => {
    assert.deepEqual(extractMentions("hey @claude how are you"), ["claude"]);
  });

  it("matches a mention at end of message", () => {
    assert.deepEqual(extractMentions("hello @kobe"), ["kobe"]);
  });

  it("lowercases the mentioned username", () => {
    assert.deepEqual(extractMentions("@Claude hi"), ["claude"]);
    assert.deepEqual(extractMentions("@CLAUDE hi"), ["claude"]);
    assert.deepEqual(extractMentions("hey @KobeBryant_24 yo"), ["kobebryant_24"]);
  });

  it("captures multiple distinct mentions in order", () => {
    assert.deepEqual(extractMentions("@claude can you ask @kobe about it"), ["claude", "kobe"]);
  });

  it("dedupes repeated mentions of the same user", () => {
    assert.deepEqual(extractMentions("@claude @claude @claude"), ["claude"]);
  });

  it("stops the username capture at punctuation", () => {
    assert.deepEqual(extractMentions("@claude!"), ["claude"]);
    assert.deepEqual(extractMentions("hello @claude, what's up?"), ["claude"]);
    assert.deepEqual(extractMentions("@claude."), ["claude"]);
  });

  it("treats underscore and digits as part of the username", () => {
    assert.deepEqual(extractMentions("@bot_v2"), ["bot_v2"]);
    assert.deepEqual(extractMentions("@user42"), ["user42"]);
  });

  it("does NOT match a mention with no leading whitespace (e.g. email)", () => {
    assert.deepEqual(extractMentions("contact me at alice@example.com"), []);
    assert.deepEqual(extractMentions("hello@claude"), []);
  });

  it("does NOT match a mention right after punctuation other than start/space", () => {
    // intentional: keeps parser simple, matches Slack/Discord convention
    assert.deepEqual(extractMentions("(@claude)"), []);
    assert.deepEqual(extractMentions("hi.@claude"), []);
  });

  it("does NOT match @@ or @ followed by non-word", () => {
    assert.deepEqual(extractMentions("@@claude"), []);
    assert.deepEqual(extractMentions("@!"), []);
    assert.deepEqual(extractMentions("@"), []);
  });

  it("matches after newline/tab as whitespace", () => {
    assert.deepEqual(extractMentions("hi\n@claude"), ["claude"]);
    assert.deepEqual(extractMentions("hi\t@claude"), ["claude"]);
  });
});

describe("MENTION_REGEX", () => {
  it("has the /g flag set (global match)", () => {
    // matchAll requires /g and we rely on it
    assert.equal(MENTION_REGEX.global, true);
  });
});

describe("buildProviderMessages", () => {
  it("returns an empty array for empty history", () => {
    assert.deepEqual(buildProviderMessages([], 42), []);
  });

  it("formats human turns as 'username: content' with role 'user'", () => {
    const history = [
      { userId: 1, username: "alice", content: "hello world" },
      { userId: 2, username: "bob", content: "hi" },
    ];
    assert.deepEqual(buildProviderMessages(history, 99), [
      { role: "user", content: "alice: hello world" },
      { role: "user", content: "bob: hi" },
    ]);
  });

  it("formats the bot's own turns with role 'assistant' and no prefix", () => {
    const history = [
      { userId: 1, username: "alice", content: "hey claude" },
      { userId: 99, username: "claude", content: "yes?" },
      { userId: 1, username: "alice", content: "what time is it?" },
    ];
    assert.deepEqual(buildProviderMessages(history, 99), [
      { role: "user", content: "alice: hey claude" },
      { role: "assistant", content: "yes?" },
      { role: "user", content: "alice: what time is it?" },
    ]);
  });

  it("preserves the order of history", () => {
    const history = Array.from({ length: 5 }, (_, i) => ({
      userId: 1,
      username: "alice",
      content: `msg${i}`,
    }));
    const result = buildProviderMessages(history, 99);
    assert.equal(result.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.equal(result[i].content, `alice: msg${i}`);
    }
  });

  it("treats only the matching botUserId as assistant, even with the same username", () => {
    const history = [
      { userId: 42, username: "claude", content: "i am the real bot" },
      { userId: 7, username: "claude", content: "i am a different user with the same name" },
    ];
    const result = buildProviderMessages(history, 42);
    assert.equal(result[0].role, "assistant");
    assert.equal(result[0].content, "i am the real bot");
    assert.equal(result[1].role, "user");
    assert.equal(result[1].content, "claude: i am a different user with the same name");
  });
});
