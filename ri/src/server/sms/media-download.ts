// Twilio MMS media lives behind Twilio's authenticated API — not viewable by a
// browser (no Twilio credentials client-side) and not guaranteed to be
// retained forever. Neither is acceptable for a pledge selfie, which must be
// durable (arch/staking.md: "Selfies must be durable... survive years of
// storage") and renderable in the app. Download it ONCE, at pledge-creation
// time, into the same local media store everything else uses (MEDIA_DIR,
// served at /media — see middleware/upload.ts).
import { randomUUID } from "crypto";
import { writeFile } from "fs/promises";
import path from "path";
import { log } from "../log.js";

const MEDIA_DIR = process.env.MEDIA_DIR ?? "/tmp/scoot-media";

function extFromContentType(ct: string | null): string {
  if (ct?.includes("png")) return ".png";
  if (ct?.includes("gif")) return ".gif";
  if (ct?.includes("webp")) return ".webp";
  return ".jpg";
}

// Downloads a Twilio-hosted MMS media URL (Basic Auth with the account's own
// credentials) and saves it to local media storage. Returns the local
// /media/<file> URL, or null if this isn't a Twilio media URL, credentials
// are unavailable, or the download fails for any reason — NEVER throws, so a
// transient network hiccup can't break the staking flow. Caller falls back to
// the original URL on null (degraded, but the ritual still completes).
export async function downloadTwilioMedia(mediaUrl: string): Promise<string | null> {
  if (!mediaUrl.startsWith("https://api.twilio.com/")) return null;
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return null;

    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const res = await fetch(mediaUrl, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) {
      log.error({ status: res.status, mediaUrl }, "downloadTwilioMedia: fetch failed");
      return null;
    }

    const filename = `${randomUUID()}${extFromContentType(res.headers.get("content-type"))}`;
    await writeFile(path.join(MEDIA_DIR, filename), Buffer.from(await res.arrayBuffer()));
    return `/media/${filename}`;
  } catch (err) {
    log.error({ err, mediaUrl }, "downloadTwilioMedia threw");
    return null;
  }
}

// Best-effort: try to localize a pledge photo, falling back to the original
// URL (which still works for SMS-only viewing, just not in the browser) if
// the download fails for any reason.
export async function localizeSelfieUrl(mediaUrl: string): Promise<string> {
  return (await downloadTwilioMedia(mediaUrl)) ?? mediaUrl;
}
