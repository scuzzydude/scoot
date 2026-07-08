// Pledge revocation over SMS — Phase 4 continued (see arch/staking.md,
// trust/revocation.ts). One entry point, "revoke <name>", that resolves which
// path applies based on who's asking:
//   - sender is the ORIGINAL STAKER of a matching pledge -> 'bogus' path, no
//     gate (freely self-service — trusts the staker's judgment, same as the
//     ritual itself).
//   - sender is a LEADER and the name matches ANY staked member -> confirmed_
//     human path (LEADER-only, deliberately admin-only, not consensus).
//   - neither -> not found (a non-LEADER never learns whether someone ELSE
//     staked the name they typed).
// Either path then asks a short reason ("why?"), mirroring the staking ritual's
// multi-turn Q&A UX rather than demanding it all in one message.
import { getPending, setPending } from "./pending.js";
import { listStakedByMe, findActivePledgeForStakeeName } from "../trust/graph.js";
import { revokePledge } from "../trust/revocation.js";
import { log } from "../log.js";

function modeLabel(mode: "bogus" | "confirmed_human"): string {
  return mode === "bogus" ? "bogus pledge" : "confirmed-human admin action";
}

export async function tryHandleRevokeCommand(
  senderId: number,
  scootId: number,
  trimmed: string,
  isLeader: boolean,
): Promise<string | null> {
  const pending = await getPending(senderId);

  // (A) resolve a pending reason prompt
  if (pending?.kind === "revoke_flow") {
    if (/^(cancel|nevermind|nvm|stop)$/i.test(trimmed)) {
      await setPending(senderId, null);
      return "Okay, cancelled — nothing changed.";
    }
    const note = /^skip$/i.test(trimmed) || !trimmed ? null : trimmed;
    const result = await revokePledge(pending.pledgeId, senderId, pending.mode, note, scootId);
    await setPending(senderId, null);
    if (!result.ok) {
      return result.reason === "already-revoked"
        ? `${pending.stakeeName}'s pledge was already revoked.`
        : `Something went wrong — that pledge couldn't be found.`;
    }
    log.info({ senderId, pledgeId: pending.pledgeId, mode: pending.mode }, "pledge revoked");
    return `✓ ${pending.stakeeName}'s pledge has been revoked (${modeLabel(pending.mode)}). Their staked status is cleared.`;
  }

  // (B) start: "revoke <name>" / "unstake <name>"
  const m = trimmed.match(/^(?:revoke|unstake)\s+(.+)$/i);
  if (!m) return null;
  const name = m[1].trim();

  // Bogus path takes priority: is the sender the staker of a matching pledge?
  const mine = await listStakedByMe(senderId);
  const own = mine.find((p) => !p.revoked && p.stakeeName.toLowerCase() === name.toLowerCase());
  if (own) {
    await setPending(senderId, { kind: "revoke_flow", pledgeId: own.pledgeId, stakeeName: own.stakeeName, mode: "bogus" });
    return `Revoking your pledge for ${own.stakeeName} (bogus pledge — no one else is affected). Why? Reply with a short reason, or "skip".`;
  }

  // Confirmed-human path: LEADER-only, any staked member.
  if (isLeader) {
    const match = await findActivePledgeForStakeeName(name);
    if (match) {
      await setPending(senderId, { kind: "revoke_flow", pledgeId: match.pledgeId, stakeeName: match.stakeeName, mode: "confirmed_human" });
      return `Revoking ${match.stakeeName}'s pledge as a confirmed-human admin action. Why? Reply with a short reason, or "skip".`;
    }
  }

  return `I don't see anyone matching "${name}" in your staked pledges.`;
}
