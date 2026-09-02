// "View as another user" for the Root account, read-only.
//
// Model: Passport keeps the REAL login id in the session as usual. When Root
// starts impersonating, we stash the target id in `session.impersonateUserId`.
// `deserializeUser` (app.ts) then loads the target into `req.user` -- so every
// route, the mail client, rooms, wallet, all just see the target -- and hangs
// the real user off `req.actor` so we never lose track of who is really here.
//
// Read-only is enforced globally by `readOnlyWhileImpersonating`: any
// non-GET/HEAD/OPTIONS request while `req.actor` is set is refused, except the
// handful of auth endpoints needed to get back out. That is deliberately
// coarse -- a blanket "no writes as someone else" beats auditing every route.
import type { Request, Response, NextFunction } from "express";
import { db } from "../db/index.js";
import { impersonationLog, type User as SchemaUser } from "../db/schema.js";
import { ROOT_USER_ID } from "../trust/graph.js";

declare module "express-session" {
  interface SessionData {
    impersonateUserId?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      /** The real logged-in user, set only while impersonating someone else. */
      actor?: SchemaUser;
    }
  }
}

// Writes that must still work while impersonating: leaving impersonation and
// logging out entirely. Everything else that mutates is refused.
const WRITE_ALLOWLIST = new Set(["/api/v1/auth/impersonate/stop", "/api/v1/auth/logout"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function readOnlyWhileImpersonating(req: Request, res: Response, next: NextFunction): void {
  if (!req.actor || SAFE_METHODS.has(req.method) || WRITE_ALLOWLIST.has(req.path)) {
    next();
    return;
  }
  res.status(403).json({ ok: false, error: "Read-only while viewing as another user" });
}

export function isRoot(user: Pick<SchemaUser, "id"> | undefined): boolean {
  return user?.id === ROOT_USER_ID;
}

/** The person actually at the keyboard, whether or not they're impersonating. */
export function realUser(req: Request): SchemaUser | undefined {
  return req.actor ?? (req.user as SchemaUser | undefined);
}

export async function logImpersonation(actorId: number, targetId: number, action: "start" | "stop"): Promise<void> {
  await db.insert(impersonationLog).values({ actorId, targetId, action });
}
