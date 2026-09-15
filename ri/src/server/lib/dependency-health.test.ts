// RIM 3.3: an optional dependency's absence must be survivable AND logged.
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { recordOk, recordFailure, healthSnapshot, __reset } from "./dependency-health.js";

describe("dependency health (RIM 3.3 — graceful is not the same as invisible)", () => {
  beforeEach(() => __reset());

  it("says nothing about a dependency it has never seen", () => {
    assert.deepEqual(healthSnapshot(), {});
  });

  it("stays quiet on a single blip but still records it", () => {
    recordFailure("vault", "ECONNREFUSED");
    const d = healthSnapshot().vault;
    assert.equal(d.ok, false);
    assert.equal(d.consecutiveFailures, 1);
    assert.equal(d.lastError, "ECONNREFUSED");
    assert.ok(d.downSince, "an outage has a start time from the first failure, not the third");
  });

  it("keeps the outage start across repeated failures", async () => {
    recordFailure("vault");
    const first = healthSnapshot().vault.downSince;
    await new Promise((r) => setTimeout(r, 5));
    recordFailure("vault");
    recordFailure("vault");
    const d = healthSnapshot().vault;
    assert.equal(d.consecutiveFailures, 3);
    assert.equal(d.downSince, first, "downSince is when it went down, not when we last noticed");
  });

  it("clears completely on recovery", () => {
    recordFailure("vault");
    recordFailure("vault");
    recordOk("vault");
    const d = healthSnapshot().vault;
    assert.equal(d.ok, true);
    assert.equal(d.consecutiveFailures, 0);
    assert.equal(d.downSince, null);
    assert.equal(d.lastError, null);
    assert.ok(d.lastOkAt);
  });

  it("tracks dependencies independently", () => {
    recordFailure("vault");
    recordOk("search");
    assert.equal(healthSnapshot().vault.ok, false);
    assert.equal(healthSnapshot().search.ok, true);
  });
});
