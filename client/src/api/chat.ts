import type { CreateRoomInput, SendMessageInput } from "@shared/schema.js";

export interface Room {
  id: number;
  name: string;
  createdBy: number;
  createdAt: string;
  lastMessage: { content: string; createdAt: string } | null;
}

export interface Message {
  id: number;
  roomId: number;
  userId: number;
  username: string;
  content: string;
  mediaUrl: string | null;
  createdAt: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}

export const chatApi = {
  getRooms: () => apiFetch<Room[]>("/chat/rooms"),

  createRoom: (data: CreateRoomInput) =>
    apiFetch<Room>("/chat/rooms", { method: "POST", body: JSON.stringify(data) }),

  getMessages: (roomId: number, before?: string) =>
    apiFetch<Message[]>(`/chat/rooms/${roomId}/messages${before ? `?before=${before}` : ""}`),

  sendMessage: (roomId: number, data: SendMessageInput) =>
    apiFetch<Message>(`/chat/rooms/${roomId}/messages`, { method: "POST", body: JSON.stringify(data) }),
};
