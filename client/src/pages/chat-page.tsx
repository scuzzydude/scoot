import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { chatApi, type Room, type Message } from "../api/chat.js";
import { createRoomSchema, sendMessageSchema, type CreateRoomInput, type SendMessageInput } from "@shared/schema.js";
import { useChatWebSocket, upsertMessage, patchRoomLastMessage, type TypingUser } from "../hooks/use-websocket.js";
import { useAuth } from "../hooks/use-auth.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { Avatar, AvatarFallback } from "../components/ui/avatar.js";
import { Bot, ChevronLeft, Plus, Send } from "lucide-react";

function renderContent(content: string) {
  const parts: (string | { mention: string })[] = [];
  const regex = /(?:^|\s)@([a-zA-Z0-9_]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const mentionStart = match.index + match[0].indexOf("@");
    if (mentionStart > lastIndex) parts.push(content.slice(lastIndex, mentionStart));
    parts.push({ mention: match[1] });
    lastIndex = mentionStart + 1 + match[1].length;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return parts.map((p, i) =>
    typeof p === "string" ? (
      <span key={i}>{p}</span>
    ) : (
      <span key={i} className="text-sky-400 font-medium">
        @{p.mention}
      </span>
    )
  );
}

function nameOf(m: { displayName: string | null; username: string }): string {
  return m.displayName ?? m.username;
}

// header + bottom nav = 3.5rem + 4rem = 7.5rem
const FULL_H = "h-[calc(100vh-7.5rem)]";

function MessageBubble({ msg, isOwn }: { msg: Message; isOwn: boolean }) {
  const name = nameOf(msg);
  const avatarSeed = name.slice(0, 2).toUpperCase();
  return (
    <div className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
      {!isOwn && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback
            className={`text-xs ${msg.isBot ? "bg-sky-900 text-sky-200" : ""}`}
          >
            {msg.isBot ? <Bot className="h-4 w-4" /> : avatarSeed}
          </AvatarFallback>
        </Avatar>
      )}
      <div className={`flex flex-col gap-0.5 max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && (
          <span className="text-xs text-white/45 px-1 flex items-center gap-1">
            {name}
            {msg.isBot && (
              <span className="text-[9px] uppercase tracking-wider text-sky-400/80 bg-sky-950/60 px-1 rounded">
                bot
              </span>
            )}
          </span>
        )}
        <div
          className={`rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
            isOwn
              ? "bg-white text-black rounded-br-sm"
              : msg.isBot
              ? "bg-sky-950/80 text-sky-50 rounded-bl-sm"
              : "bg-zinc-800 text-white rounded-bl-sm"
          }`}
        >
          {renderContent(msg.content)}
        </div>
      </div>
    </div>
  );
}

function TypingIndicator({ users }: { users: TypingUser[] }) {
  if (users.length === 0) return null;
  const names = users.map(nameOf);
  const text =
    names.length === 1
      ? `${names[0]} is typing…`
      : names.length === 2
      ? `${names[0]} and ${names[1]} are typing…`
      : `${names.length} people are typing…`;
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-xs text-white/55">
      <span className="inline-flex gap-0.5">
        <span className="w-1 h-1 rounded-full bg-white/40 animate-pulse [animation-delay:0ms]" />
        <span className="w-1 h-1 rounded-full bg-white/40 animate-pulse [animation-delay:150ms]" />
        <span className="w-1 h-1 rounded-full bg-white/40 animate-pulse [animation-delay:300ms]" />
      </span>
      {text}
    </div>
  );
}

function MessageList({ roomId }: { roomId: number }) {
  const { user } = useAuth();
  const { data: messages = [] } = useQuery({
    queryKey: ["chat", "messages", roomId],
    queryFn: () => chatApi.getMessages(roomId),
  });

  const { typingUsers } = useChatWebSocket(roomId);

  return (
    <ScrollArea className="flex-1 px-4 py-3">
      <div className="flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-center text-white/30 text-sm py-8">No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} isOwn={msg.userId === user?.id} />
        ))}
        <TypingIndicator users={typingUsers} />
      </div>
    </ScrollArea>
  );
}

function MessageInput({ roomId }: { roomId: number }) {
  const qc = useQueryClient();
  const { register, handleSubmit, reset } = useForm<SendMessageInput>({
    resolver: zodResolver(sendMessageSchema),
  });

  const sendMutation = useMutation({
    mutationFn: (data: SendMessageInput) => chatApi.sendMessage(roomId, data),
    onSuccess: (msg) => {
      qc.setQueryData<Message[]>(["chat", "messages", roomId], (prev) =>
        upsertMessage(prev, msg)
      );
      qc.setQueryData<Room[]>(["chat", "rooms"], (prev) =>
        patchRoomLastMessage(prev, roomId, { content: msg.content, createdAt: msg.createdAt })
      );
      reset();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((d) => sendMutation.mutate(d))}
      className="flex gap-2 p-3 border-t border-border bg-black"
    >
      <Input
        {...register("content")}
        placeholder="Message…"
        className="flex-1 rounded-full bg-zinc-900 border-zinc-700 focus-visible:ring-zinc-600"
        autoComplete="off"
      />
      <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={sendMutation.isPending}>
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}

function NewRoomForm({ onCreated }: { onCreated: (room: Room) => void }) {
  const { register, handleSubmit, reset } = useForm<CreateRoomInput>({
    resolver: zodResolver(createRoomSchema),
  });

  const mutation = useMutation({
    mutationFn: chatApi.createRoom,
    onSuccess: (room) => {
      reset();
      onCreated(room);
    },
  });

  return (
    <form
      onSubmit={handleSubmit((d) => mutation.mutate(d))}
      className="flex gap-2 p-3 border-t border-border"
    >
      <Input
        {...register("name")}
        placeholder="New room…"
        className="flex-1 h-9 text-sm"
      />
      <Button type="submit" size="icon" className="h-9 w-9 shrink-0">
        <Plus className="h-4 w-4" />
      </Button>
    </form>
  );
}

function RoomRow({
  room,
  active,
  onClick,
}: {
  room: Room;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 border-b border-border/40 transition-colors hover:bg-zinc-900 ${
        active ? "bg-zinc-900" : ""
      }`}
    >
      <span className="text-sm font-medium text-white"># {room.name}</span>
      {room.lastMessage ? (
        <span className="text-xs text-white/40 truncate">{room.lastMessage.content}</span>
      ) : (
        <span className="text-xs text-white/25 italic">No messages yet</span>
      )}
    </button>
  );
}

export default function ChatPage() {
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const qc = useQueryClient();

  const { data: rooms = [] } = useQuery({
    queryKey: ["chat", "rooms"],
    queryFn: chatApi.getRooms,
  });

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  return (
    <div className={`flex ${FULL_H} overflow-hidden`}>
      {/* Sidebar / Room list */}
      <aside
        className={`${
          activeRoomId !== null ? "hidden md:flex" : "flex"
        } w-full md:w-72 md:shrink-0 flex-col border-r border-border bg-black`}
      >
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Rooms</p>
        </div>
        <ScrollArea className="flex-1">
          {rooms.length === 0 && (
            <p className="text-sm text-white/30 text-center py-8">No rooms yet</p>
          )}
          {rooms.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              active={room.id === activeRoomId}
              onClick={() => setActiveRoomId(room.id)}
            />
          ))}
        </ScrollArea>
        <NewRoomForm
          onCreated={(room) => {
            qc.setQueryData<Room[]>(["chat", "rooms"], (prev) =>
              prev ? [room, ...prev] : [room]
            );
            setActiveRoomId(room.id);
          }}
        />
      </aside>

      {/* Chat area */}
      <div
        className={`${
          activeRoomId !== null ? "flex" : "hidden md:flex"
        } flex-1 flex-col bg-black`}
      >
        {activeRoom ? (
          <>
            {/* Room header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <button
                onClick={() => setActiveRoomId(null)}
                className="md:hidden text-white/60 hover:text-white transition-colors"
                aria-label="Back"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <p className="font-semibold text-sm"># {activeRoom.name}</p>
            </div>
            <MessageList roomId={activeRoom.id} />
            <MessageInput roomId={activeRoom.id} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-white/25 text-sm">
            Select a room
          </div>
        )}
      </div>
    </div>
  );
}
