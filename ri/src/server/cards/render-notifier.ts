// Texts a member when the host render worker (scripts/card-render-worker.sh)
// finishes their card -- or gives up on their photo. The worker can't send
// SMS itself (Twilio lives in the app), so it just flips card_art.status and
// this poller does the talking. Idempotent via meta.notified on the row.
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { cardArt, users } from "../db/schema.js";
import { throttledSend } from "../sms/send.js";
import { absoluteMediaUrl } from "../sms/card-commands.js";
import { shortHash } from "../sms/card-photo-commands.js";
import { log } from "../log.js";

const INTERVAL_MS = Number(process.env.CARD_NOTIFY_INTERVAL_MS ?? 60_000);
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function markNotified(hash: string, how: string): Promise<void> {
  await db.update(cardArt)
    .set({ meta: sql`${cardArt.meta} || ${JSON.stringify({ notified: new Date().toISOString(), notified_how: how })}::jsonb` })
    .where(eq(cardArt.hash, hash));
}

export async function notifyRenderOutcomesOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const rows = await db.select({ art: cardArt, phone: users.phone })
      .from(cardArt)
      .innerJoin(users, eq(users.id, cardArt.userId))
      .where(and(
        isNull(sql`${cardArt.meta}->>'notified'`),
        sql`coalesce(${cardArt.meta}->>'hold','') <> 'true'`,   // review-first renders: Brandon releases them
        sql`(
          (${cardArt.kind} = 'render' AND ${cardArt.meta}->>'stage' = 'card' AND ${cardArt.status} = 'rendered')
          OR (${cardArt.kind} = 'source' AND ${cardArt.status} = 'failed')
        )`,
      ))
      .limit(10);

    for (const { art, phone } of rows) {
      if (!phone) { await markNotified(art.hash, "no-phone"); continue; }
      if (art.kind === "render") {
        const sid = await throttledSend(phone,
          `Your new card's ready (${shortHash(art.hash)}). Reply "approve card" to make it your card, or "reject card" to toss it.`,
          [absoluteMediaUrl(art.mediaUrl)]);
        if (sid) { await markNotified(art.hash, "mms"); log.info({ hash: shortHash(art.hash), userId: art.userId }, "card render: member notified"); }
      } else {
        const sid = await throttledSend(phone,
          "Couldn't make a card from that photo -- try another one: face the camera, good light, one person in the shot.");
        if (sid) { await markNotified(art.hash, "sms"); log.warn({ hash: shortHash(art.hash), userId: art.userId, error: (art.meta as { error?: string }).error }, "card render: failure notified"); }
      }
    }
  } catch (err) {
    log.error({ err }, "card render notifier: pass failed");
  } finally {
    running = false;
  }
}

export function startRenderNotifier(): void {
  if (timer) return;
  timer = setInterval(() => void notifyRenderOutcomesOnce(), INTERVAL_MS);
  log.info({ intervalMs: INTERVAL_MS }, "card render notifier: started");
}
