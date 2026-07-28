import { Router } from "express";
import { db } from "../db/index.js";
import { scoots, scootMembers, scootPages, scootPageBlocks, ScootFlags } from "../db/schema.js";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { userIsLeader, userHasScootFlag, getLeaderMessageFeed } from "../sms/oversight.js";
import { getUserSmsLog, getAllSmsLog } from "../sms/log.js";
import { getTrustCatalog } from "../trust/graph.js";
import { canSelfStake, selfStake } from "../trust/self-stake.js";
import { mintScoot, proposeSend, respondToSend, getBalance, listTransactions, type ScootTxDecision } from "../scoot/ledger.js";

const router = Router();
router.use(requireAuth);

// Staking catalog (Phase 4 continued, see arch/staking.md) — "Brotherhood
// public info, but restricted": visible to any STAKED member of the Scoot, not
// the general public or an unstaked registered user.
router.get("/:id/staking-catalog", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const scootId = parseInt(req.params.id);
  if (isNaN(scootId)) return res.status(400).json({ ok: false, error: "invalid id" });
  if (!(await userHasScootFlag(scootId, userId, ScootFlags.STAKED))) {
    return res.status(403).json({ ok: false, error: "staked members only" });
  }
  const catalog = await getTrustCatalog(scootId);
  const viewerCanSelfStake = await canSelfStake(userId, scootId);
  res.json({ ok: true, data: { ...catalog, viewerCanSelfStake } });
});

// Self-stake bootstrap — hard-gated (see trust/self-stake.ts): the caller must
// be BOTH ROOT_USER_ID and hold ScootFlags.ENGINEER. selfieUrl comes from an
// already-uploaded file (POST /api/v1/media/upload).
router.post("/:id/self-stake", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const scootId = parseInt(req.params.id);
  if (isNaN(scootId)) return res.status(400).json({ ok: false, error: "invalid id" });
  if (!(await canSelfStake(userId, scootId))) {
    return res.status(403).json({ ok: false, error: "not permitted" });
  }
  const { selfieUrl } = req.body as { selfieUrl?: string };
  if (!selfieUrl) return res.status(400).json({ ok: false, error: "selfieUrl required" });
  const result = await selfStake(userId, scootId, selfieUrl);
  if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
  res.json({ ok: true });
});

// Scoot currency ledger (Phase 5a, DB-first — see scoot/ledger.ts). All
// endpoints require Scoot membership; mint additionally requires being the
// Scoot's trustee (enforced in ledger.ts, not just here).

router.get("/:id/scoot/balance", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const scootId = parseInt(req.params.id);
  if (isNaN(scootId)) return res.status(400).json({ ok: false, error: "invalid id" });

  const member = await db.query.scootMembers.findFirst({
    where: and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)),
  });
  if (!member) return res.status(404).json({ ok: false, error: "not found" });

  const balance = await getBalance(scootId, userId);
  res.json({ ok: true, data: { balance } });
});

router.get("/:id/scoot/transactions", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const scootId = parseInt(req.params.id);
  if (isNaN(scootId)) return res.status(400).json({ ok: false, error: "invalid id" });

  const member = await db.query.scootMembers.findFirst({
    where: and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)),
  });
  if (!member) return res.status(404).json({ ok: false, error: "not found" });

  const data = await listTransactions(scootId, userId);
  res.json({ ok: true, data });
});

// Trustee-only. Mints directly into the trustee's own balance — see
// scoot/ledger.ts header for why "mint then distribute" is mint + send.
router.post("/:id/scoot/mint", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const scootId = parseInt(req.params.id);
  if (isNaN(scootId)) return res.status(400).json({ ok: false, error: "invalid id" });

  const { amount, note } = req.body as { amount?: number; note?: string };
  if (typeof amount !== "number") return res.status(400).json({ ok: false, error: "amount required" });

  const result = await mintScoot(scootId, userId, amount, note ?? null);
  if (!result.ok) return res.status(403).json({ ok: false, error: result.reason });
  res.json({ ok: true, data: result.transaction });
});

// Propose a transfer. Balance doesn't move until the recipient responds —
// see POST /:id/scoot/transactions/:txId/respond.
router.post("/:id/scoot/send", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const scootId = parseInt(req.params.id);
  if (isNaN(scootId)) return res.status(400).json({ ok: false, error: "invalid id" });

  const member = await db.query.scootMembers.findFirst({
    where: and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)),
  });
  if (!member) return res.status(404).json({ ok: false, error: "not found" });

  const { toUserId, amount, note } = req.body as { toUserId?: number; amount?: number; note?: string };
  if (typeof toUserId !== "number" || typeof amount !== "number") {
    return res.status(400).json({ ok: false, error: "toUserId and amount required" });
  }

  const result = await proposeSend(scootId, userId, toUserId, amount, note ?? null);
  if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
  res.json({ ok: true, data: result.transaction });
});

router.post("/:id/scoot/transactions/:txId/respond", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const scootId = parseInt(req.params.id);
  const txId = parseInt(req.params.txId);
  if (isNaN(scootId) || isNaN(txId)) return res.status(400).json({ ok: false, error: "invalid id" });

  const { decision } = req.body as { decision?: ScootTxDecision };
  if (decision !== "accepted" && decision !== "rejected" && decision !== "cancelled") {
    return res.status(400).json({ ok: false, error: "invalid decision" });
  }

  const result = await respondToSend(scootId, txId, userId, decision);
  if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
  res.json({ ok: true, data: result.response });
});

// §8.7 LEADER oversight — all messages across all rooms, bypassing accessMask.
// Gated: caller must hold ScootFlags.LEADER in this Scoot (the disclaimer warns
// every member this view exists). Keyset pagination via ?beforeId, ?limit.
router.get("/:id/oversight/messages", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const scootId = parseInt(req.params.id);
  if (isNaN(scootId)) return res.status(400).json({ ok: false, error: "invalid id" });
  if (!(await userIsLeader(scootId, userId))) {
    return res.status(403).json({ ok: false, error: "leader only" });
  }
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const beforeId = req.query.beforeId ? parseInt(req.query.beforeId as string) : undefined;
  const feed = await getLeaderMessageFeed({
    limit: Number.isNaN(limit as number) ? undefined : limit,
    beforeId: Number.isNaN(beforeId as number) ? undefined : beforeId,
  });
  res.json({ ok: true, data: feed });
});

// Global sequential SMS log — every user's texts. Gated on ScootFlags.TEXT_AUDIT
// (a privilege grantable independently of LEADER).
router.get("/:id/oversight/all-texts", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const scootId = parseInt(req.params.id);
  if (isNaN(scootId)) return res.status(400).json({ ok: false, error: "invalid id" });
  if (!(await userHasScootFlag(scootId, userId, ScootFlags.TEXT_AUDIT))) {
    return res.status(403).json({ ok: false, error: "not permitted" });
  }
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const beforeId = req.query.beforeId ? parseInt(req.query.beforeId as string) : undefined;
  const data = await getAllSmsLog({
    limit: Number.isNaN(limit as number) ? undefined : limit,
    beforeId: Number.isNaN(beforeId as number) ? undefined : beforeId,
  });
  res.json({ ok: true, data });
});

// §8.8 LEADER view of one member's SMS transcript (what texts they see).
router.get("/:id/oversight/sms-log/:userId", async (req, res) => {
  const requesterId = (req.user as { id: number }).id;
  const scootId = parseInt(req.params.id);
  const targetId = parseInt(req.params.userId);
  if (isNaN(scootId) || isNaN(targetId)) return res.status(400).json({ ok: false, error: "invalid id" });
  if (!(await userIsLeader(scootId, requesterId))) {
    return res.status(403).json({ ok: false, error: "leader only" });
  }
  const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
  const beforeId = req.query.beforeId ? parseInt(req.query.beforeId as string) : undefined;
  const data = await getUserSmsLog(targetId, {
    limit: Number.isNaN(limit as number) ? undefined : limit,
    beforeId: Number.isNaN(beforeId as number) ? undefined : beforeId,
  });
  res.json({ ok: true, data });
});

router.get("/", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const rows = await db
    .select({
      id: scoots.id,
      slug: scoots.slug,
      name: scoots.name,
      description: scoots.description,
      logoUrl: scoots.logoUrl,
      labelMap: scoots.labelMap,
      featureFlags: scoots.featureFlags,
      navItems: scoots.navItems,
      userFlags: scootMembers.userFlags,
    })
    .from(scootMembers)
    .innerJoin(scoots, eq(scootMembers.scootId, scoots.id))
    .where(eq(scootMembers.userId, userId))
    .orderBy(asc(scoots.name));
  res.json({ ok: true, data: rows });
});

router.get("/:id", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const scootId = parseInt(req.params.id);
  if (isNaN(scootId)) return res.status(400).json({ ok: false, error: "invalid id" });

  const member = await db.query.scootMembers.findFirst({
    where: and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)),
  });
  if (!member) return res.status(404).json({ ok: false, error: "not found" });

  const scoot = await db.query.scoots.findFirst({ where: eq(scoots.id, scootId) });
  if (!scoot) return res.status(404).json({ ok: false, error: "not found" });

  res.json({ ok: true, data: { ...scoot, userFlags: member.userFlags } });
});

router.get("/:id/pages", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const scootId = parseInt(req.params.id);
  if (isNaN(scootId)) return res.status(400).json({ ok: false, error: "invalid id" });

  const member = await db.query.scootMembers.findFirst({
    where: and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)),
  });
  if (!member) return res.status(404).json({ ok: false, error: "not found" });

  const pages = await db
    .select({
      id: scootPages.id,
      slug: scootPages.slug,
      title: scootPages.title,
      navLabel: scootPages.navLabel,
      navOrder: scootPages.navOrder,
    })
    .from(scootPages)
    .where(and(eq(scootPages.scootId, scootId), eq(scootPages.published, true)))
    .orderBy(asc(scootPages.navOrder), asc(scootPages.title));

  res.json({ ok: true, data: pages });
});

router.get("/:id/pages/:slug", async (req, res) => {
  const userId = (req.user as { id: number }).id;
  const scootId = parseInt(req.params.id);
  if (isNaN(scootId)) return res.status(400).json({ ok: false, error: "invalid id" });

  const member = await db.query.scootMembers.findFirst({
    where: and(eq(scootMembers.scootId, scootId), eq(scootMembers.userId, userId)),
  });
  if (!member) return res.status(404).json({ ok: false, error: "not found" });

  const page = await db.query.scootPages.findFirst({
    where: and(eq(scootPages.scootId, scootId), eq(scootPages.slug, req.params.slug), eq(scootPages.published, true)),
  });
  if (!page) return res.status(404).json({ ok: false, error: "page not found" });

  const blocks = await db
    .select()
    .from(scootPageBlocks)
    .where(eq(scootPageBlocks.pageId, page.id))
    .orderBy(asc(scootPageBlocks.blockOrder));

  res.json({ ok: true, data: { ...page, blocks } });
});

export default router;
