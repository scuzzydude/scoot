# Plan: Bot Token Usage Tracking (Per-User Daily Caps)

**Goal:** Track LLM token consumption per brother per day for DM-bot conversations, and enforce a configurable daily limit to prevent overuse.

---

## Motivation

The `/api/bot/message` route calls the LLM on behalf of individual users. With no tracking, one brother could exhaust the API budget unnoticed. We want:
- Visibility into who is using how many tokens
- A hard (configurable) daily cap per user

---

## Changes Required

### 1. Schema — new `bot_usage` table (`ri/src/server/db/schema.ts`)

```typescript
export const botUsage = pgTable(
  "bot_usage",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    date: text("date").notNull(),          // "YYYY-MM-DD" UTC
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
  },
  (t) => ({
    userDateUniq: unique().on(t.userId, t.date),
  })
);
```

Run `npm run db:push` after adding. The unique constraint on `(user_id, date)` enables safe upserts.

### 2. Provider interface — return usage alongside reply (`ri/src/server/llm/provider.ts`)

Change `chat()` return type:

```typescript
export interface ChatResult {
  reply: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMProvider {
  chat(messages: { role: string; content: string }[], options?: ChatOptions): Promise<ChatResult>;
}
```

### 3. Anthropic provider — plumb token counts (`ri/src/server/llm/anthropic.ts`)

The Anthropic SDK returns `response.usage.input_tokens` and `response.usage.output_tokens`. Return them in `ChatResult`.

### 4. OpenAI-compat provider — same shape (`ri/src/server/llm/openai-compat.ts`)

OpenAI-compatible APIs return `response.usage.prompt_tokens` / `completion_tokens`. Map to the same `ChatResult.usage` shape. Mark as optional in case the endpoint omits it.

### 5. Bot route — enforce limit + upsert usage (`ri/src/server/routes/bot.ts`)

**Before calling the LLM:**
- Read today's `bot_usage` row for `req.user.id`
- If `tokensIn + tokensOut >= BOT_TOKEN_DAILY_LIMIT` → return 429 with a friendly message

**After getting the reply:**
- Upsert the `bot_usage` row: increment `tokensIn` and `tokensOut` by the amounts from `ChatResult.usage`
- Use Postgres `ON CONFLICT (user_id, date) DO UPDATE` via Drizzle

**Env var:** `BOT_TOKEN_DAILY_LIMIT` — default `50000` (tokens total per user per day). Add to `.env.example`.

---

## What We Are NOT Doing (Keep It Simple)

- No per-session breakdown (daily granularity is enough for enforcement)
- No admin UI to view usage (query the table directly if needed)
- No soft-warning before the hard cut-off (just block at the limit)
- No rolling 30-day window (daily resets keep it simple)

---

## Files Touched

| File | Change |
|---|---|
| `ri/src/server/db/schema.ts` | Add `botUsage` table |
| `ri/src/server/llm/provider.ts` | `chat()` returns `ChatResult` |
| `ri/src/server/llm/anthropic.ts` | Return `usage` from SDK response |
| `ri/src/server/llm/openai-compat.ts` | Return `usage` from SDK response |
| `ri/src/server/routes/bot.ts` | Pre-check limit, post-upsert usage |
| `.env.example` | Add `BOT_TOKEN_DAILY_LIMIT=50000` |

---

## Migration

```bash
npm run db:push
```

No data migration needed — table starts empty, usage accumulates forward.
