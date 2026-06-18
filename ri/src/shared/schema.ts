import { z } from "zod";

export const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, underscores only"),
  displayName: z.string().min(1).max(64),
  email: z.string().email(),
  phone: z.string().regex(/^\d{10}$/, "10-digit US number, no spaces or dashes"),
});

// Step 1: request OTP — just a phone number
export const loginRequestSchema = z.object({
  phone: z.string().regex(/^\d{10}$/, "10-digit US number"),
});

// Step 2: verify OTP — phone + code
export const loginVerifySchema = z.object({
  phone: z.string().regex(/^\d{10}$/, "10-digit US number"),
  code: z.string().length(5),
});

// Keep loginSchema as an alias for loginRequestSchema (used in auth hook)
export const loginSchema = loginRequestSchema;

const attachmentSchema = z.object({
  url: z.string().max(1024),
  name: z.string().max(255),
  type: z.string().max(128),
  size: z.number().optional(),
});

export const sendMessageSchema = z.object({
  content: z.string().max(4000).default(""),
  mediaUrl: z.string().max(1024).regex(/^(\/media\/|https?:\/\/)/, "invalid media url").optional(),
  mediaName: z.string().max(255).optional(),
  mediaType: z.string().max(128).optional(),
  attachments: z.array(attachmentSchema).max(25).optional(),
}).refine((d) => d.content.trim().length > 0 || !!d.mediaUrl || (d.attachments?.length ?? 0) > 0, {
  message: "message must have text or an attachment",
});

export const createRoomSchema = z.object({
  name: z.string().min(1).max(64),
  inviteIds: z.array(z.number().int().positive()).optional(),  // human members to add at creation
  skipBots: z.boolean().optional(),  // when true, do not auto-join bots
});

export const moveRoomSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  parentId: z.number().int().positive().nullable().optional(),  // null = move to top level
  pinnedModel: z.string().max(128).nullable().optional(),       // null = clear pinned model
});

export const sendScootSchema = z.object({
  toUsername: z.string().min(1),
  amount: z.number().int().positive(),
});

export const botMessageSchema = z.object({
  content: z.string().min(1).max(8000),
  mode: z.enum(["full", "cotb"]).optional().default("full"),
});

export const navItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  external: z.boolean().optional(),
});

export const blockMarkdownSchema = z.object({
  blockType: z.literal("markdown"),
  content: z.object({ text: z.string() }),
});

export const blockImageSchema = z.object({
  blockType: z.literal("image"),
  content: z.object({ url: z.string(), alt: z.string(), caption: z.string().optional() }),
});

export const blockLinkListSchema = z.object({
  blockType: z.literal("link_list"),
  content: z.object({ links: z.array(z.object({ label: z.string(), href: z.string(), external: z.boolean().optional() })) }),
});

export const blockComponentSchema = z.object({
  blockType: z.literal("component"),
  content: z.object({ component: z.string(), props: z.record(z.unknown()).optional() }),
});

export const pageBlockSchema = z.discriminatedUnion("blockType", [
  blockMarkdownSchema,
  blockImageSchema,
  blockLinkListSchema,
  blockComponentSchema,
]);

export type NavItem = z.infer<typeof navItemSchema>;
export type PageBlock = z.infer<typeof pageBlockSchema>;

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginRequestInput = z.infer<typeof loginRequestSchema>;
export type LoginVerifyInput = z.infer<typeof loginVerifySchema>;
export type LoginInput = LoginRequestInput;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type SendScootInput = z.infer<typeof sendScootSchema>;
export type BotMessageInput = z.infer<typeof botMessageSchema>;
