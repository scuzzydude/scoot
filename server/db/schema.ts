import { pgTable, serial, text, integer, timestamp, boolean, primaryKey } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  isBot: boolean("is_bot").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bots = pgTable("bots", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  systemPrompt: text("system_prompt").notNull(),
  autoJoinNewRooms: boolean("auto_join_new_rooms").notNull().default(false),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatRooms = pgTable("chat_rooms", {
  id: serial("id").primaryKey(),
  name: text("name"),
  isDm: boolean("is_dm").notNull().default(false),
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
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id").references(() => chatRooms.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Bot = typeof bots.$inferSelect;
export type NewBot = typeof bots.$inferInsert;
export type ChatRoom = typeof chatRooms.$inferSelect;
export type Message = typeof messages.$inferSelect;
