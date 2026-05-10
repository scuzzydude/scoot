import { z } from "zod";

export const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Letters, numbers, underscores only"),
  email: z.string().email(),
  password: z.string().min(8),
});

export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  mediaUrl: z.string().url().optional(),
});

export const createRoomSchema = z.object({
  name: z.string().min(1).max(64),
});

export const sendScootSchema = z.object({
  toUsername: z.string().min(1),
  amount: z.number().int().positive(),
});

export const botMessageSchema = z.object({
  content: z.string().min(1).max(8000),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type SendScootInput = z.infer<typeof sendScootSchema>;
export type BotMessageInput = z.infer<typeof botMessageSchema>;
