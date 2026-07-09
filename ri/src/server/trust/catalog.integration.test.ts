import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users, scoots, scootMembers, pledges, pledgeRevocations, ScootFlags } from "../db/schema.js";
import { recordPledge } from "./ledger.js";
import { revokePledge } from "./revocation.js";
import { getTrustCatalog, ROOT_USER_ID } from "./graph.js";

const SFX = `catalog-${Date.now()}`;
let scootId: number;
const userIds: number[] = [];
const pledgeIds: number[] = [];

async function mkUser(name: string): Promise<number> {
  const [u] = await db.insert(users).values({ username: `${name}-${SFX}`, displayName: name }).returning({ id: users.id });
  userIds.push(u.id);
  return u.id;
}

describe("getTrustCatalog", () => {
  before(async () => {
    const [sc] = await db.insert(scoots).values({ slug: SFX, name: `T ${SFX}` }).returning({ id: scoots.id });
    scootId = sc.id;
  });

  after(async () => {
    await db.delete(pledgeRevocations).where(inArray(pledgeRevocations.pledgeId, pledgeIds));
    await db.delete(pledges).where(inArray(pledges.id, pledgeIds));
    await db.delete(scootMembers).where(eq(scootMembers.scootId, scootId));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(scoots).where(eq(scoots.id, scootId));
    await pool.end();
  });

  it("includes the root, live pledge edges (with tier), excludes revoked, buckets legacy staked members", async () => {
    const child = await mkUser("ChildA");
    const grandchild = await mkUser("GrandchildB");
    const revokedChild = await mkUser("RevokedC");
    const legacy = await mkUser("LegacyD");

    await db.insert(scootMembers).values([
      { scootId, userId: child, userFlags: String(ScootFlags.STAKED | ScootFlags.OG) },
      { scootId, userId: grandchild, userFlags: String(ScootFlags.STAKED) },
      { scootId, userId: revokedChild, userFlags: String(ScootFlags.STAKED) },
      { scootId, userId: legacy, userFlags: String(ScootFlags.STAKED | ScootFlags.SENIOR) }, // no pledge at all
    ]);

    const p1 = await recordPledge({ stakerId: ROOT_USER_ID, stakeeId: child, selfieUrl: "https://x/1.jpg", stakingCode: "1" });
    const p2 = await recordPledge({ stakerId: child, stakeeId: grandchild, selfieUrl: "https://x/2.jpg", stakingCode: "2" });
    const p3 = await recordPledge({ stakerId: ROOT_USER_ID, stakeeId: revokedChild, selfieUrl: "https://x/3.jpg", stakingCode: "3" });
    pledgeIds.push(p1.id, p2.id, p3.id);
    await revokePledge(p3.id, ROOT_USER_ID, "bogus", null, scootId);

    const catalog = await getTrustCatalog(scootId);

    assert.equal(catalog.root.userId, ROOT_USER_ID);

    const ours = catalog.edges.filter((e) => [p1.id, p2.id, p3.id].includes(e.pledgeId));
    assert.equal(ours.length, 2); // p3 excluded (revoked)
    const e1 = catalog.edges.find((e) => e.pledgeId === p1.id)!;
    assert.equal(e1.stakeeName, "ChildA");
    assert.equal(e1.tier, "og");
    const e2 = catalog.edges.find((e) => e.pledgeId === p2.id)!;
    assert.equal(e2.stakerName, "ChildA");
    assert.equal(e2.stakeeName, "GrandchildB");
    assert.equal(e2.tier, "member");

    const legacyMatch = catalog.legacyMembers.find((m) => m.userId === legacy);
    assert.ok(legacyMatch, "legacy staked member (no pledge) should be bucketed");
    assert.equal(legacyMatch!.tier, "senior");
    // revokePledge clears STAKED entirely -> revokedChild is no longer staked at
    // all, so they're absent from BOTH edges and the legacy bucket (not "legacy",
    // just not a member anymore).
    assert.equal(catalog.legacyMembers.some((m) => m.userId === revokedChild), false);
    // child/grandchild should NOT appear in legacy (they have a live pledge)
    assert.equal(catalog.legacyMembers.some((m) => m.userId === child), false);
    assert.equal(catalog.legacyMembers.some((m) => m.userId === grandchild), false);
  });

  it("a self-pledge (root bootstrap) surfaces as root.selfieUrl, not as an edge", async () => {
    const p = await recordPledge({ stakerId: ROOT_USER_ID, stakeeId: ROOT_USER_ID, selfieUrl: "https://x/root.jpg", stakingCode: "SELF" });
    pledgeIds.push(p.id);
    const catalog = await getTrustCatalog(scootId);
    assert.equal(catalog.root.selfieUrl, "https://x/root.jpg");
    assert.equal(catalog.edges.some((e) => e.pledgeId === p.id), false);
  });
});
