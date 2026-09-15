// Optional-dependency health, for the "graceful AND invisible" trap.
//
// RIM_architecture_v0.8 §3.3 added this as an explicit requirement, and it did so by
// correcting our own framing. We presented as a feature the rule that every Memory Vault
// call degrades invisibly -- BigMo "must reply exactly as it would without it." Our own
// incident log then showed that store down for roughly thirteen hours with recall silently
// no-op'ing, noticed only by hand. In the document's words:
//
//   "Graceful and invisible are different properties, and conflating them is what produced
//    the outage. A participant's absence must be survivable AND logged."
//
// So: the degrade stays (an SMS reply must never wait on an optional service), and the
// absence stops being silent. One warn per failure as before, ONE error when an outage is
// established, one info when it clears, and a snapshot on /api/health so a passing glance
// shows it.
import { log } from "../log.js";

const ESCALATE_AFTER_FAILURES = 3;
const ESCALATE_AFTER_MS = 5 * 60 * 1000;

interface DepState {
  ok: boolean;
  consecutiveFailures: number;
  firstFailureAt: number | null;
  lastFailureAt: number | null;
  lastOkAt: number | null;
  lastError: string | null;
  escalated: boolean;
}

const deps = new Map<string, DepState>();

function get(name: string): DepState {
  let d = deps.get(name);
  if (!d) {
    d = { ok: true, consecutiveFailures: 0, firstFailureAt: null, lastFailureAt: null, lastOkAt: null, lastError: null, escalated: false };
    deps.set(name, d);
  }
  return d;
}

export function recordOk(name: string): void {
  const d = get(name);
  const wasDown = d.escalated;
  const downForMs = d.firstFailureAt ? Date.now() - d.firstFailureAt : 0;
  d.ok = true;
  d.consecutiveFailures = 0;
  d.firstFailureAt = null;
  d.lastError = null;
  d.escalated = false;
  d.lastOkAt = Date.now();
  if (wasDown) log.info({ dependency: name, downForMs }, "dependency recovered");
}

export function recordFailure(name: string, detail?: string): void {
  const d = get(name);
  const now = Date.now();
  d.ok = false;
  d.consecutiveFailures += 1;
  d.lastFailureAt = now;
  d.lastError = detail ?? null;
  if (d.firstFailureAt == null) d.firstFailureAt = now;

  // One error line per outage, not per call -- an outage that logs on every call is as
  // easy to miss as one that logs on none.
  const established = d.consecutiveFailures >= ESCALATE_AFTER_FAILURES || now - d.firstFailureAt >= ESCALATE_AFTER_MS;
  if (established && !d.escalated) {
    d.escalated = true;
    log.error(
      { dependency: name, consecutiveFailures: d.consecutiveFailures, downSince: new Date(d.firstFailureAt).toISOString(), lastError: d.lastError },
      "dependency DOWN — degrading silently until it returns; see /api/health",
    );
  }
}

export interface DependencySnapshot {
  ok: boolean;
  downSince: string | null;
  consecutiveFailures: number;
  lastOkAt: string | null;
  lastError: string | null;
}

// Everything known so far. A dependency that has never been called does not appear, which
// is honest: we have no evidence about it either way.
export function healthSnapshot(): Record<string, DependencySnapshot> {
  const out: Record<string, DependencySnapshot> = {};
  for (const [name, d] of deps) {
    out[name] = {
      ok: d.ok,
      downSince: d.ok || !d.firstFailureAt ? null : new Date(d.firstFailureAt).toISOString(),
      consecutiveFailures: d.consecutiveFailures,
      lastOkAt: d.lastOkAt ? new Date(d.lastOkAt).toISOString() : null,
      lastError: d.lastError,
    };
  }
  return out;
}

// Test seam only.
export function __reset(): void {
  deps.clear();
}
