// Self-stake bootstrap over SMS — Phase 4 continued (see arch/staking.md,
// trust/self-stake.ts). Same hard two-factor gate as the app UI (ROOT_USER_ID
// + ScootFlags.ENGINEER); this just makes it reachable over text, since SMS is
// the platform's primary interface. The code step is largely ceremonial here —
// there's no second party to prove co-presence with, so the REAL security
// boundary is the two-factor gate — but it mirrors the familiar code-then-photo
// shape of the normal ritual.
//
//   "self stake" / "selfstake" -> issues a one-time code (24h) tied to this
//     sender, or reports already-done / not-permitted.
//   (mid-flow) a bare photo    -> completes it; "cancel" abandons.
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { stakingCodes } from "../db/schema.js";
import { getPending, setPending } from "./pending.js";
import { canSelfStake, hasSelfStaked, selfStake } from "../trust/self-stake.js";
import { log } from "../log.js";

function generateCode(): string {
  return String(Math.floor(Math.random() * 100000)).padStart(5, "0");
}

export async function tryHandleSelfStakeCommand(
  senderId: number,
  scootId: number,
  trimmed: string,
  hasPhoto: boolean,
  photoUrl: string | undefined,
): Promise<string | null> {
  const pending = await getPending(senderId);

  // (A) resolve a pending self-stake flow
  if (pending?.kind === "self_stake_flow") {
    if (/^(cancel|nevermind|nvm|stop)$/i.test(trimmed)) {
      await setPending(senderId, null);
      return "Okay, cancelled — nothing changed.";
    }
    if (!hasPhoto) {
      return `Send a photo of yourself to complete self-staking (or reply "cancel").`;
    }
    await db.update(stakingCodes).set({ used: true }).where(eq(stakingCodes.id, pending.stakingCodeId));
    const result = await selfStake(senderId, scootId, photoUrl!);
    await setPending(senderId, null);
    if (!result.ok) {
      return result.reason === "already-staked"
        ? "You've already self-staked."
        : "You're not permitted to self-stake.";
    }
    log.info({ senderId, scootId }, "self-stake complete (SMS)");
    return "✓ You are now self-staked — the root of trust, recorded with your photo.";
  }

  // (B) start: "self stake" / "selfstake"
  const norm = trimmed.trim().toLowerCase();
  if (norm !== "self stake" && norm !== "selfstake") return null;

  if (!(await canSelfStake(senderId, scootId))) {
    return "Only the root engineer can self-stake.";
  }
  if (await hasSelfStaked(senderId)) {
    return "You've already self-staked.";
  }

  const code = generateCode();
  const [row] = await db.insert(stakingCodes).values({
    userId: senderId,
    code,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  }).returning({ id: stakingCodes.id });

  await setPending(senderId, { kind: "self_stake_flow", stakingCodeId: row.id });
  log.info({ senderId, scootId }, "self-stake code issued (SMS)");
  return `Your self-stake code is ${code} (recorded). Send a photo of yourself to complete it, or reply "cancel".`;
}
