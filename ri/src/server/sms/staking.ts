// Staking ritual — Phase 4 (SMS-driven v1, per social_graph_staking design memory).
//
// Simplified vs. the original QR-ceremony design: no live device handshake. A
// prospect texts BigMo to get a one-time code; hands it to an in-person staked
// member; that staker texts the code back to BigMo, then walks a short Q&A
// (photo, then age tier) conducted as separate turns — never one rigid
// all-in-one message, since that trips up exactly the members this is for.
//
// Age tier is attested by the STAKER directly (senior 55+ / OG 70+ / regular
// member) — the system NEVER stores or computes from a birthdate. The 55/70-by-
// birth-YEAR rule is the human rule the staker applies in the field; BigMo only
// ever sees the resulting tier, never a birth year (same "no LLM math on
// personal facts" posture as schedule.ts's date handling).
//
// The 2-person selfie is evidentiary — a paper trail for the rare "mystery
// hooper turned out to be a scammer" case — not primarily a public artifact.
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, scootMembers, stakingCodes, ScootFlags, type User } from "../db/schema.js";
import { getPending, setPending } from "./pending.js";
import { recordPledge } from "../trust/ledger.js";
import { log } from "../log.js";

function generateCode(): string {
  return String(Math.floor(Math.random() * 100000)).padStart(5, "0");
}

async function getScootMembership(scootId: number, userId: number): Promise<bigint> {
  const [m] = await db.select({ f: scootMembers.userFlags }).from(scootMembers)
    .where(and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)));
  return m ? BigInt(m.f) : 0n;
}

async function setScootFlags(scootId: number, userId: number, flags: bigint): Promise<void> {
  await db.insert(scootMembers).values({ scootId, userId, userFlags: flags.toString() })
    .onConflictDoUpdate({ target: [scootMembers.scootId, scootMembers.userId], set: { userFlags: flags.toString() } });
}

// --- prospect side: "stake" / "stake me" requests a code --------------------

// Works for a total stranger — staking IS how a brand-new prospect gets an
// account at all (no self-serve signup otherwise). Returns the reply, or null
// if this text isn't a stake request.
export async function tryHandleStakeRequest(phone: string, scootId: number, trimmed: string): Promise<string | null> {
  const norm = trimmed.trim().toLowerCase();
  if (norm !== "stake" && norm !== "stake me") return null;

  let prospect = await db.query.users.findFirst({ where: eq(users.phone, phone) });
  if (!prospect) {
    const [created] = await db.insert(users).values({ username: `p${phone}`, phone }).returning();
    prospect = created;
    log.info({ userId: prospect.id, phone }, "staking: created placeholder user for new prospect");
  }

  if ((await getScootMembership(scootId, prospect.id) & ScootFlags.STAKED) !== 0n) {
    return "You're already staked into the Brotherhood!";
  }

  await db.update(stakingCodes).set({ used: true })
    .where(and(eq(stakingCodes.userId, prospect.id), eq(stakingCodes.used, false)));
  const code = generateCode();
  await db.insert(stakingCodes).values({ userId: prospect.id, code, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  log.info({ userId: prospect.id, phone }, "staking code issued");
  return `Your staking code is ${code}. Give this to a staked Brother in person — they'll text it to BigMo to start staking you. Code expires in 24 hours.`;
}

// --- staker side: multi-turn Q&A --------------------------------------------

const TIER_WORDS: Record<string, bigint | null> = {
  senior: ScootFlags.SENIOR, sr: ScootFlags.SENIOR, "55": ScootFlags.SENIOR,
  og: ScootFlags.OG, "70": ScootFlags.OG,
  member: null, regular: null, reg: null, no: null, none: null, skip: null,
};

function parseTierReply(word: string): { matched: true; flag: bigint | null } | { matched: false } {
  const key = word.trim().toLowerCase();
  return key in TIER_WORDS ? { matched: true, flag: TIER_WORDS[key] } : { matched: false };
}

function tierLabel(flag: bigint | null): string {
  return flag === ScootFlags.OG ? "an OG" : flag === ScootFlags.SENIOR ? "a Senior" : "a regular member";
}

async function stakeeDisplayName(userId: number): Promise<string> {
  const [u] = await db.select({ n: users.displayName, u: users.username }).from(users).where(eq(users.id, userId));
  return u?.n ?? u?.u ?? `user ${userId}`;
}

// One inbound from a KNOWN, staked-or-not sender, in the middle of (or starting)
// a staking Q&A as the STAKER. `body`/`hasPhoto` describe this one turn.
// Returns the reply, or null if this sender has no staking business right now
// (→ caller falls through to normal command/routing handling).
export async function tryHandleStakerFlow(
  staker: User,
  scootId: number,
  body: string,
  hasPhoto: boolean,
  photoUrl: string | undefined,
): Promise<string | null> {
  const trimmed = body.trim();
  const pending = await getPending(staker.id);

  // cancel is always available mid-flow
  if (pending?.kind === "stake_flow" && /^(cancel|nevermind|nvm|stop)$/i.test(trimmed)) {
    await setPending(staker.id, null);
    return "Okay, staking cancelled — nothing was changed.";
  }

  // (A) start: "stake 12345" — only recognized when no flow is already in progress
  // for a DIFFERENT code (starting a fresh one abandons an unfinished one).
  const start = trimmed.match(/^stake\s+(\d{5})$/i);
  if (start) {
    const code = start[1];
    const stakerFlags = await getScootMembership(scootId, staker.id);
    if ((stakerFlags & ScootFlags.STAKED) === 0n) {
      return "You need to be staked yourself before you can stake others.";
    }
    const stakingCode = await db.query.stakingCodes.findFirst({
      where: and(eq(stakingCodes.code, code), eq(stakingCodes.used, false), gt(stakingCodes.expiresAt, new Date())),
    });
    if (!stakingCode) return "That code is invalid or expired. Have them text BigMo \"stake\" for a new one.";
    const stakeeFlags = await getScootMembership(scootId, stakingCode.userId);
    if ((stakeeFlags & ScootFlags.STAKED) !== 0n) {
      return `${await stakeeDisplayName(stakingCode.userId)} is already staked!`;
    }
    const stakeeName = await stakeeDisplayName(stakingCode.userId);
    await setPending(staker.id, { kind: "stake_flow", step: "awaiting_selfie", stakingCodeId: stakingCode.id, stakeeId: stakingCode.userId, stakeeName });
    log.info({ stakerId: staker.id, stakeeId: stakingCode.userId }, "staking: flow started");
    return `Got it — staking ${stakeeName}. Send me a photo of you two together (for the record).`;
  }

  if (pending?.kind !== "stake_flow") return null;

  // (B) awaiting the 2-person selfie
  if (pending.step === "awaiting_selfie") {
    if (!hasPhoto) {
      return `Almost there — send a photo of you and ${pending.stakeeName} together to continue (or reply "cancel").`;
    }
    await setPending(staker.id, { ...pending, step: "awaiting_tier", selfieUrl: photoUrl });
    return `Got the photo. Is ${pending.stakeeName} a senior (55+), an OG (70+), or just a regular member? Reply "senior", "og", or "member".`;
  }

  // (C) awaiting the age-tier attestation
  if (pending.step === "awaiting_tier") {
    if (!trimmed) return `Reply "senior", "og", or "member" for ${pending.stakeeName}.`;
    const parsed = parseTierReply(trimmed);
    if (!parsed.matched) {
      return `I didn't catch that — reply "senior" (55+), "og" (70+), or "member" for ${pending.stakeeName}.`;
    }

    // finalize
    const stakeeFlags = (await getScootMembership(scootId, pending.stakeeId)) | ScootFlags.STAKED;
    const finalFlags = parsed.flag ? (stakeeFlags | parsed.flag) : stakeeFlags;
    await setScootFlags(scootId, pending.stakeeId, finalFlags);
    await db.update(stakingCodes).set({ used: true }).where(eq(stakingCodes.id, pending.stakingCodeId));
    const [stakingCodeRow] = await db.select({ code: stakingCodes.code }).from(stakingCodes).where(eq(stakingCodes.id, pending.stakingCodeId));
    await recordPledge({
      stakerId: staker.id,
      stakeeId: pending.stakeeId,
      selfieUrl: pending.selfieUrl ?? "",
      stakingCode: stakingCodeRow?.code ?? "",
    });
    await setPending(staker.id, null);
    log.info({ stakerId: staker.id, stakeeId: pending.stakeeId, tier: parsed.flag?.toString() ?? "member" }, "staking: complete");
    return `✓ ${pending.stakeeName} is now staked as ${tierLabel(parsed.flag)}! Welcome to the Fonde Brotherhood.`;
  }

  return null;
}
