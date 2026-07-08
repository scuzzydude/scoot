// Shared A2P-safe outbound SMS throttle. A single process-wide serialized queue
// spaces every outbound text ~1/sec — the long-code 10DLC ceiling — regardless of
// how many callers send at once (fan-out §8.4, privacy disclaimers §8.7, …). So
// concurrent senders can't sum past the limit. Read the gap at call-time so tests
// can zero it via SMS_SEND_GAP_MS.
import { getProvider } from "./provider.js";
import { log } from "../log.js";

const gapMs = () => Number(process.env.SMS_SEND_GAP_MS ?? 1100);
let sendChain: Promise<unknown> = Promise.resolve();
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Serialized, throttled send. Returns the Twilio SID, or null on failure (a bad
// recipient or uninitialized provider never aborts the rest of the queue).
export function throttledSend(to: string, body: string): Promise<string | null> {
  const result = sendChain.then(async () => {
    try {
      const res = await getProvider().send(to, body);
      return res.sid;
    } catch (err) {
      log.error({ err, to }, "sms send failed");
      return null;
    }
  });
  // The next queued send waits the gap after this one settles (success or not).
  sendChain = result.then(() => delay(gapMs()));
  return result;
}
