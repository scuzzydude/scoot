import { pgTable, serial, text, integer, timestamp, boolean, primaryKey, jsonb } from "drizzle-orm/pg-core";

// Bit positions for users.flags
export const UserFlags = {
  BOT:      1 << 0,  // 1
  STAKED:   1 << 1,  // 2
  GYMBOSS:  1 << 2,  // 4  (deprecated — migrating to per-Scoot ScootFlags.GYMBOSS)
} as const;

// Bit positions for scoot_members.user_flags (per-Scoot 64-bit mask, stored as
// text, read with BigInt). Bits 1|2 are legacy "engineer roles" on other Scoots
// (see rc-webhook.ts) — gym roles use higher bits to stay clear. See arch/sms-rooms.md.
export const ScootFlags = {
  STAKED:   1n << 2n,  // 4   — staked member of this Scoot
  LEADER:   1n << 3n,  // 8   — oversight: read all messages, enable SMS-mirror
  GYMBOSS:  1n << 4n,  // 16  — schedule authority: set/clear scoot_sessions
  BETA:     1n << 5n,  // 32  — beta/dev tester: gets early SMS features + rollout announcements
  LEGEND_NUMBER: 1n << 6n,  // 64  — awarded a reserved legend's/patron's number (honor; e.g. a deceased legend's # given to an OG). See arch/sms-rooms.md.
  TEXT_AUDIT: 1n << 7n,  // 128 — may view the global sequential SMS log (every user's texts), not just their own. Grantable independently of LEADER.
  // Age tiers (Phase 4 staking ritual) — attested by the STAKER at staking time,
  // never a stored birthdate. The 55/70-by-birth-YEAR rule is the human rule the
  // staker applies in the field; the system only ever stores the resulting tier.
  // Mutually exclusive; OG supersedes SENIOR. Neither bit set = regular member.
  SENIOR: 1n << 8n,  // 256 — senior (55+), the senior-basketball cutoff
  OG:     1n << 9n,  // 512 — OG (70+)
  // Self-stake bootstrap authority (Phase 4 continued — see trust/self-stake.ts).
  // NOT the same concept as the legacy rc-webhook "engineer" bits 1|2 above
  // (a different, vestigial RC-chat-role display feature) — a fresh bit on
  // purpose, so this high-stakes gate can never be widened by touching an
  // unrelated legacy flag. Self-stake requires BOTH this flag AND being
  // ROOT_USER_ID (hardcoded in trust/graph.ts) — a "hard cut" so a future
  // engineer granted this flag for legitimate dev-access reasons still can't
  // self-stake; they go through the normal pledge ritual like anyone else.
  ENGINEER: 1n << 10n,  // 1024
} as const;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  phone: text("phone").unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  flags: integer("flags").notNull().default(0),
  yearOfBirth: integer("year_of_birth"),
  privacyDisclaimerAt: timestamp("privacy_disclaimer_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bots = pgTable("bots", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  systemPrompt: text("system_prompt").notNull(),
  autoJoinNewRooms: boolean("auto_join_new_rooms").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  searchEnabled: boolean("search_enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatRooms = pgTable("chat_rooms", {
  id: serial("id").primaryKey(),
  name: text("name"),
  parentId: integer("parent_id"),  // NULL = top-level category; set = child room under a category
  // "folder" | "conversation" | "dm" — drives the scoot-chat sidebar tree.
  // isDm is kept as the internal source of truth for DM logic; roomType is the
  // client-facing classification (dm rooms get roomType='dm', folders 'folder').
  roomType: text("room_type").notNull().default("conversation"),
  pinnedModel: text("pinned_model"),  // LLM model pinned to this room (NULL = use default)
  isDm: boolean("is_dm").notNull().default(false),
  accessMask: text("access_mask").notNull().default("0"),  // bigint as text — JS can't hold 64-bit int safely
  postMask: text("post_mask").notNull().default("0"),
  smsMirror: boolean("sms_mirror").notNull().default(false),  // room may fan out to SMS (LEADER-gated)
  createdBy: integer("created_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dmPairs = pgTable(
  "dm_pairs",
  {
    userLo: integer("user_lo").references(() => users.id, { onDelete: "cascade" }).notNull(),
    userHi: integer("user_hi").references(() => users.id, { onDelete: "cascade" }).notNull(),
    roomId: integer("room_id").references(() => chatRooms.id, { onDelete: "cascade" }).notNull().unique(),
  },
  (t) => ({
    pairPk: primaryKey({ columns: [t.userLo, t.userHi] }),
  })
);

export const roomMembers = pgTable("room_members", {
  roomId: integer("room_id").references(() => chatRooms.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  lastReadAt: timestamp("last_read_at"),
  smsEnabled: boolean("sms_enabled").notNull().default(false),  // this member wants this room on their phone
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").references(() => chatRooms.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  sessionId: integer("session_id").references(() => scootSessions.id, { onDelete: "set null" }),  // optional: tag a field note to a session
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  mediaName: text("media_name"),
  mediaType: text("media_type"),
  attachments: jsonb("attachments").$type<{ url: string; name: string; type: string; size?: number }[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  storagePath: text("storage_path").notNull(),
  uploadedBy: integer("uploaded_by").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scoots = pgTable("scoots", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  logoUrl: text("logo_url"),
  labelMap: jsonb("label_map").notNull().default({}),
  featureFlags: jsonb("feature_flags").notNull().default({}),
  navItems: jsonb("nav_items").notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scootMembers = pgTable(
  "scoot_members",
  {
    scootId: integer("scoot_id").references(() => scoots.id, { onDelete: "cascade" }).notNull(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    userFlags: text("user_flags").notNull().default("0"),  // 64-bit permission bitmask as text
    // Reserved legend/patron jersey # this member is awarded to "wear" (pairs with
    // ScootFlags.LEGEND_NUMBER). The number stays a reserved seat in `users`; the
    // member keeps their own id. e.g. McGhee (member) wears 24. See arch/sms-rooms.md.
    wornNumber: integer("worn_number"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.scootId, t.userId] }),
  })
);

export const scootPages = pgTable("scoot_pages", {
  id: serial("id").primaryKey(),
  scootId: integer("scoot_id").references(() => scoots.id, { onDelete: "cascade" }).notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  navLabel: text("nav_label"),
  navOrder: integer("nav_order").notNull().default(0),
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const scootPageBlocks = pgTable("scoot_page_blocks", {
  id: serial("id").primaryKey(),
  pageId: integer("page_id").references(() => scootPages.id, { onDelete: "cascade" }).notNull(),
  blockType: text("block_type").notNull(),
  blockOrder: integer("block_order").notNull(),
  content: jsonb("content").notNull(),
});

export const loginOtps = pgTable("login_otps", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const stakingCodes = pgTable("staking_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  code: text("code").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// The trust graph's edge list (staker -> stakee) — see arch/staking.md. APPEND-
// ONLY: a pledge's core fields (staker/stakee/selfie/code/timestamp) are never
// UPDATEd or DELETEd once inserted. Any future correction (e.g. revocation) must
// be recorded as a NEW event referencing this pledge, never a mutation — this is
// what lets Phase 5's scootd later ingest this table as a clean chain genesis.
// Always insert via trust/ledger.ts's recordPledge(), never db.insert(pledges)
// directly, so contentHash stays a trustworthy fingerprint of what happened.
export const pledges = pgTable("pledges", {
  id: serial("id").primaryKey(),
  stakerId: integer("staker_id").notNull().references(() => users.id),
  stakeeId: integer("stakee_id").notNull().references(() => users.id),
  selfieUrl: text("selfie_url").notNull(),
  stakingCode: text("staking_code").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // sha256 fingerprint of the immutable fields above, computed at insert time
  // with the exact createdAt used (never the DB default) — see trust/ledger.ts.
  contentHash: text("content_hash").notNull(),
});

// A correction event for a pledge — the ledger's append-only contract in
// practice: a revocation is a NEW row referencing the pledge, never an UPDATE/
// DELETE of it. At most one per pledge (unique). Two paths (arch/staking.md):
// 'bogus' (the staker was tricked / broke ritual rules — freely self-service by
// the original staker) and 'confirmed_human' (the person WAS real but the
// community un-vouches anyway, e.g. a later-discovered bad actor — LEADER-only).
export const pledgeRevocations = pgTable("pledge_revocations", {
  id: serial("id").primaryKey(),
  pledgeId: integer("pledge_id").notNull().references(() => pledges.id).unique(),
  revokedBy: integer("revoked_by").notNull().references(() => users.id),
  reason: text("reason").notNull(), // 'bogus' | 'confirmed_human'
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Authoritative schedule — GYMBOSS-only structured data. BigMo answers from the
// next non-cancelled session (no runtime day-of-week math). See arch/sms-rooms.md.
// Named scoot_sessions to avoid the connect-pg-simple `session` table.
export const scootSessions = pgTable("scoot_sessions", {
  id: serial("id").primaryKey(),
  scootId: integer("scoot_id").references(() => scoots.id, { onDelete: "cascade" }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  location: text("location"),
  status: text("status").notNull().default("tentative"),  // tentative | confirmed | cancelled
  note: text("note"),  // e.g. "moved to 5pm"
  updatedBy: integer("updated_by").references(() => users.id),  // must hold ScootFlags.GYMBOSS
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Schedule change verification — §6 escalation. When a GYMBOSS confirm/cancel
// conflicts with another GYMBOSS's recent opposite change, BigMo opens a poll
// (texts all GYMBOSSes Y/N) instead of silently flip-flopping. First decisive
// reply resolves it; only then is the change applied.
export const scheduleVerifications = pgTable("schedule_verifications", {
  id: serial("id").primaryKey(),
  scootId: integer("scoot_id").references(() => scoots.id, { onDelete: "cascade" }).notNull(),
  sessionId: integer("session_id").references(() => scootSessions.id, { onDelete: "cascade" }).notNull(),
  requestedBy: integer("requested_by").references(() => users.id).notNull(),
  action: text("action").notNull(),   // 'confirm' | 'cancel'
  question: text("question").notNull(),
  status: text("status").notNull().default("open"),  // open | approved | rejected
  resolvedBy: integer("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

// Per-user SMS routing state — persisted so a restart doesn't lose a user mid-convo.
export const smsState = pgTable("sms_state", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  activeRoomId: integer("active_room_id").references(() => chatRooms.id),
  pending: jsonb("pending"),  // e.g. { kind: 'route_confirm', candidates: [...], body: '...' }
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Per-user SMS log — truthful record of what actually went over the wire.
export const smsDeliveries = pgTable("sms_deliveries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  messageId: integer("message_id").references(() => messages.id, { onDelete: "set null" }),  // null for BigMo system replies
  roomId: integer("room_id").references(() => chatRooms.id),
  direction: text("direction").notNull(),  // 'in' | 'out'
  body: text("body").notNull(),
  twilioSid: text("twilio_sid"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Bot = typeof bots.$inferSelect;
export type NewBot = typeof bots.$inferInsert;
export type ChatRoom = typeof chatRooms.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Scoot = typeof scoots.$inferSelect;
export type ScootPage = typeof scootPages.$inferSelect;
export type ScootPageBlock = typeof scootPageBlocks.$inferSelect;
export type ScootSession = typeof scootSessions.$inferSelect;
export type NewScootSession = typeof scootSessions.$inferInsert;
export type SmsState = typeof smsState.$inferSelect;
export type SmsDelivery = typeof smsDeliveries.$inferSelect;
export type Pledge = typeof pledges.$inferSelect;
export type PledgeRevocation = typeof pledgeRevocations.$inferSelect;
