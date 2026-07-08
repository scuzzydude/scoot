import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users, pledges } from "../db/schema.js";
import { recordPledge } from "../trust/ledger.js";
import { ROOT_USER_ID } from "../trust/graph.js";
import { tryHandleTrustQuery } from "./trust-commands.js";

const SFX = `trustcmd-${Date.now()}`;
const userIds: number[] = [];
const pledgeIds: number[] = [];

async function mkUser(name: string): Promise<number> {
  const [u] = await db.insert(users).values({ username: `${name}-${SFX}`, displayName: name }).returning({ id: users.id });
  userIds.push(u.id);
  return u.id;
}

describe("trust-graph SMS commands", () => {
  after(async () => {
    await db.delete(pledges).where(inArray(pledges.id, pledgeIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await pool.end();
  });

  it("non-matching text returns null (falls through)", async () => {
    const u = await mkUser("nobody");
    assert.equal(await tryHandleTrustQuery(u, "hello there"), null);
  });

  it("'my pledges' with none staked yet", async () => {
    const u = await mkUser("empty1");
    const reply = await tryHandleTrustQuery(u, "my pledges");
    assert.match(reply ?? "", /haven't staked anyone/i);
  });

  it("'my pledges' lists staked members by name", async () => {
    const staker = await mkUser("stakerA");
    const stakee = await mkUser("MarcoTest");
    const row = await recordPledge({ stakerId: staker, stakeeId: stakee, selfieUrl: "https://x/a.jpg", stakingCode: "22222" });
    pledgeIds.push(row.id);
    const reply = await tryHandleTrustQuery(staker, "mypledges");
    assert.match(reply ?? "", /You've staked 1 Brother/);
    assert.match(reply ?? "", /MarcoTest/);
  });

  it("'my chain' for the root reports itself as root", async () => {
    const reply = await tryHandleTrustQuery(ROOT_USER_ID, "my chain");
    assert.match(reply ?? "", /root of trust/i);
  });

  it("'my chain' traces a real chain by name", async () => {
    const mid = await mkUser("MidLink");
    const leaf = await mkUser("LeafLink");
    const p1 = await recordPledge({ stakerId: ROOT_USER_ID, stakeeId: mid, selfieUrl: "https://x/1.jpg", stakingCode: "33333" });
    const p2 = await recordPledge({ stakerId: mid, stakeeId: leaf, selfieUrl: "https://x/2.jpg", stakingCode: "44444" });
    pledgeIds.push(p1.id, p2.id);
    const reply = await tryHandleTrustQuery(leaf, "trace me");
    assert.match(reply ?? "", /2 hops from root/);
    assert.match(reply ?? "", /MidLink/);
    assert.match(reply ?? "", /LeafLink/);
  });

  it("'my chain' for an untraceable member says so", async () => {
    const orphan = await mkUser("Orphan1");
    const reply = await tryHandleTrustQuery(orphan, "my chain");
    assert.match(reply ?? "", /don't have a pledge on record/i);
  });
});
