// Seed the next ~4 weeks of tentative scoot_sessions from the standing pattern.
// Idempotent: skips any (scoot, starts_at) that already exists. Re-run weekly
// (or via cron later) to keep the horizon populated. The DB is the source of
// truth after seeding; this pattern mirrors ri/src/server/llm/schedule.ts.
import "dotenv/config";
import { db, pool } from "../db/index.js";
import { scoots, scootSessions } from "../db/schema.js";
import { and, eq } from "drizzle-orm";

const SCOOT_SLUG = "dream-laboratory";
const HORIZON_DAYS = 28;
const LOCATION = "Fonde Recreation Center, Houston";

// dow: 0=Sun..6=Sat ; times are Central wall-clock.
const PATTERN = [
  { dow: 2, sh: 15, sm: 30, eh: 18, em: 0 }, // Tuesday 3:30pm–6:00pm
  { dow: 6, sh: 10, sm: 0, eh: 12, em: 0 },  // Saturday 10:00am–12:00pm
];

const TZ = "America/Chicago";

// Offset (local − UTC) in minutes at a given instant, per America/Chicago.
function chicagoOffsetMinutes(date: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hour12: false, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((asUTC - date.getTime()) / 60000);
}

// The UTC instant whose America/Chicago wall-clock is (y,mo,d,h,mi). DST-correct.
function centralWallToUtc(y: number, mo: number, d: number, h: number, mi: number): Date {
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const off = chicagoOffsetMinutes(new Date(guess));
    guess = Date.UTC(y, mo - 1, d, h, mi) - off * 60000;
  }
  return new Date(guess);
}

// Central calendar date (y/m/d/dow) `addDays` from now.
function centralDate(now: Date, addDays: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    }).formatToParts(now).map((p) => [p.type, p.value])
  );
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // Anchor at noon UTC of the Central date, add days, re-read fields.
  const anchor = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, 12) + addDays * 86400000);
  return {
    y: anchor.getUTCFullYear(), mo: anchor.getUTCMonth() + 1, d: anchor.getUTCDate(),
    dow: (wdMap[parts.weekday as string] + addDays) % 7,
  };
}

const [scoot] = await db.select({ id: scoots.id }).from(scoots).where(eq(scoots.slug, SCOOT_SLUG));
if (!scoot) {
  process.stderr.write(`Scoot '${SCOOT_SLUG}' not found — run seed-scoot34.ts first.\n`);
  await pool.end();
  process.exit(1);
}

const now = new Date();
let created = 0, skipped = 0;
for (let offset = 0; offset < HORIZON_DAYS; offset++) {
  const { y, mo, d, dow } = centralDate(now, offset);
  for (const p of PATTERN) {
    if (p.dow !== dow) continue;
    const startsAt = centralWallToUtc(y, mo, d, p.sh, p.sm);
    const endsAt = centralWallToUtc(y, mo, d, p.eh, p.em);
    if (startsAt.getTime() < now.getTime()) continue; // don't seed past sessions
    const [exists] = await db.select({ id: scootSessions.id })
      .from(scootSessions)
      .where(and(eq(scootSessions.scootId, scoot.id), eq(scootSessions.startsAt, startsAt)));
    if (exists) { skipped++; continue; }
    await db.insert(scootSessions).values({
      scootId: scoot.id, startsAt, endsAt, location: LOCATION, status: "tentative",
    });
    created++;
    process.stdout.write(`  + ${startsAt.toISOString()} (${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow]})\n`);
  }
}
process.stdout.write(`Sessions: ${created} created, ${skipped} already present\n`);
await pool.end();
process.stdout.write("Done.\n");
