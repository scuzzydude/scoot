// No-privacy disclaimer — §7 / §8.7 of arch/sms-rooms.md.
//
// Because a LEADER can read every message (oversight.ts), a no-privacy notice is
// MANDATORY: sent on join and at least once a year (users.privacy_disclaimer_at),
// over SMS and shown in the app. Delivery is recorded (sms_deliveries). It is NOT
// a hard posting-block — too much friction for 55+ Brothers (§7).
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, smsDeliveries, type User } from "../db/schema.js";
import { throttledSend } from "./send.js";
import { log } from "../log.js";

export const DISCLAIMER_TEXT =
  "Fonde Brotherhood: heads up — messages on this line are NOT private. Group " +
  "leaders can read all messages for safety and accountability. By texting here " +
  "you accept that. (Reply STOP to opt out of texts.)";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// Due if never sent, or the last send was ≥ 1 year ago.
export function isDisclaimerDue(lastAt: Date | null, now: Date = new Date()): boolean {
  if (!lastAt) return true;
  return now.getTime() - lastAt.getTime() >= YEAR_MS;
}

// Send the disclaimer if due and the user has a phone. Stamps
// users.privacy_disclaimer_at only on a confirmed send (so a provider failure
// retries next time), and always records the attempt in sms_deliveries. Returns
// true iff a text went out. Fire-and-forget & self-contained — it degrades to a
// no-op on any error and NEVER blocks or breaks the reply already in hand.
export async function ensureDisclaimer(
  user: Pick<User, "id" | "phone" | "privacyDisclaimerAt">,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    if (!user.phone) return false;
    if (!isDisclaimerDue(user.privacyDisclaimerAt ?? null, now)) return false;

    const sid = await throttledSend(user.phone, DISCLAIMER_TEXT);
    await db.insert(smsDeliveries).values({
      userId: user.id,
      messageId: null,
      roomId: null,
      direction: "out",
      body: DISCLAIMER_TEXT,
      twilioSid: sid,
    });
    if (!sid) return false; // send failed → leave stamp untouched so it retries

    await db.update(users).set({ privacyDisclaimerAt: now }).where(eq(users.id, user.id));
    log.info({ userId: user.id, sid }, "privacy disclaimer sent");
    return true;
  } catch (err) {
    log.error({ err, userId: user.id }, "disclaimer send failed");
    return false;
  }
}
