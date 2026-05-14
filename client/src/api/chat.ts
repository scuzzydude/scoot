import type { CreateRoomInput, SendMessageInput } from "@shared/schema.js";

export interface Peer {
  id: number;
  username: string;
  displayName: string | null;
}

export interface Room {
  id: number;
  name: string | null;
  isDm: boolean;
  createdBy: number;
  createdAt: string;
  lastMessage: { content: string; createdAt: string } | null;
  peer: Peer | null;
}

export function roomTitle(room: Room): string {
  if (room.isDm && room.peer) {
    return room.peer.displayName ?? room.peer.username;
  }
  return room.name ?? "(untitled)";
}

export interface Message {
  id: number;
  roomId: number;
  userId: number;
  username: string;
  displayName: string | null;
  isBot: boolean;
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

  getUsers: () => apiFetch<Peer[]>("/chat/users"),

  getOrCreateDm: (userId: number) =>
    apiFetch<Room>(`/chat/dms/${userId}`, { method: "POST" }),
};
