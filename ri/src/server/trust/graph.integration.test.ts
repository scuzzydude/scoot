import "dotenv/config";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "../db/index.js";
import { users, pledges } from "../db/schema.js";
import { recordPledge, pledgeContentHash } from "./ledger.js";
import { traceToRoot, depthFromRoot, listStakedByMe, ROOT_USER_ID } from "./graph.js";

const SFX = `graph-${Date.now()}`;
const userIds: number[] = [];
const pledgeIds: number[] = [];

async function mkUser(name: string): Promise<number> {
  const [u] = await db.insert(users).values({ username: `${name}-${SFX}` }).returning({ id: users.id });
  userIds.push(u.id);
  return u.id;
}
async function pledge(stakerId: number, stakeeId: number, at?: Date): Promise<void> {
  const row = await recordPledge({ stakerId, stakeeId, selfieUrl: `https://x/${stakerId}-${stakeeId}.jpg`, stakingCode: "12345" }, at);
  pledgeIds.push(row.id);
}

describe("trust ledger + graph (Phase 4 continued)", () => {
  after(async () => {
    await db.delete(pledges).where(inArray(pledges.id, pledgeIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await pool.end();
  });

  it("pledgeContentHash is deterministic for identical input and changes on any field change", () => {
    const at = new Date("2026-01-01T00:00:00Z");
    const base = { stakerId: 1, stakeeId: 2, selfieUrl: "https://x/a.jpg", stakingCode: "11111", createdAt: at };
    const h1 = pledgeContentHash(base);
    const h2 = pledgeContentHash({ ...base });
    assert.equal(h1, h2);
    assert.equal(h1.length, 64); // sha256 hex
    assert.notEqual(h1, pledgeContentHash({ ...base, selfieUrl: "https://x/b.jpg" }));
    assert.notEqual(h1, pledgeContentHash({ ...base, createdAt: new Date("2026-01-02T00:00:00Z") }));
  });

  it("recordPledge stores a matching contentHash and forbids no direct writes elsewhere (contract)", async () => {
    const a = await mkUser("a1");
    const b = await mkUser("b1");
    const at = new Date("2026-02-01T00:00:00Z");
    await pledge(a, b, at);
    const [row] = await db.select().from(pledges).where(eq(pledges.stakeeId, b));
    const expected = pledgeContentHash({ stakerId: a, stakeeId: b, selfieUrl: row.selfieUrl, stakingCode: row.stakingCode, createdAt: row.createdAt });
    assert.equal(row.contentHash, expected);
  });

  it("traceToRoot: root itself resolves trivially", async () => {
    const r = await traceToRoot(ROOT_USER_ID);
    assert.equal(r.reached, true);
    assert.equal(r.reason, "root");
    assert.deepEqual(r.chain, [ROOT_USER_ID]);
  });

  it("traceToRoot: a chain of pledges resolves back through root", async () => {
    // root -> mid -> leaf
    const mid = await mkUser("mid");
    const leaf = await mkUser("leaf");
    await pledge(ROOT_USER_ID, mid);
    await pledge(mid, leaf);

    const r = await traceToRoot(leaf);
    assert.equal(r.reached, true);
    assert.deepEqual(r.chain, [leaf, mid, ROOT_USER_ID]);
    assert.equal(await depthFromRoot(leaf), 2);
    assert.equal(await depthFromRoot(mid), 1);
  });

  it("traceToRoot: a user with no pledge on record is untraceable, not crashed on", async () => {
    const orphan = await mkUser("orphan");
    const r = await traceToRoot(orphan);
    assert.equal(r.reached, false);
    assert.equal(r.reason, "no-pledge-on-record");
    assert.equal(await depthFromRoot(orphan), null);
  });

  it("traceToRoot: a cycle is detected and does not infinite-loop", async () => {
    const x = await mkUser("x");
    const y = await mkUser("y");
    await pledge(x, y); // y staked by x
    await pledge(y, x); // x staked by y — a cycle, x and y never reach root

    const r = await traceToRoot(x);
    assert.equal(r.reached, false);
    assert.equal(r.reason, "cycle-detected");
  });

  it("listStakedByMe returns this staker's pledges, newest first, with stakee names", async () => {
    const staker = await mkUser("staker1");
    const s1 = await mkUser("stakee1");
    const s2 = await mkUser("stakee2");
    await pledge(staker, s1, new Date("2026-01-01T00:00:00Z"));
    await pledge(staker, s2, new Date("2026-03-01T00:00:00Z"));

    const list = await listStakedByMe(staker);
    assert.equal(list.length, 2);
    assert.equal(list[0].stakeeId, s2); // newest first
    assert.equal(list[1].stakeeId, s1);
    assert.match(list[0].stakeeName, /stakee2/);
  });

  it("listStakedByMe returns an empty list for someone who hasn't staked anyone", async () => {
    const lonely = await mkUser("lonely");
    assert.deepEqual(await listStakedByMe(lonely), []);
  });
});
