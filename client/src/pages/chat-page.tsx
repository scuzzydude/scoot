import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { chatApi, type Room, type Message } from "../api/chat.js";
import { createRoomSchema, sendMessageSchema, type CreateRoomInput, type SendMessageInput } from "@shared/schema.js";
import { useChatWebSocket } from "../hooks/use-websocket.js";
import { useAuth } from "../hooks/use-auth.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { Avatar, AvatarFallback } from "../components/ui/avatar.js";
import { ChevronLeft, Plus, Send } from "lucide-react";

// header + bottom nav = 3.5rem + 4rem = 7.5rem
const FULL_H = "h-[calc(100vh-7.5rem)]";

function MessageBubble({ msg, isOwn }: { msg: Message; isOwn: boolean }) {
  return (
    <div className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
      {!isOwn && (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="text-xs">{msg.username.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      )}
      <div className={`flex flex-col gap-0.5 max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && <span className="text-xs text-white/45 px-1">{msg.username}</span>}
        <div
          className={`rounded-2xl px-4 py-2 text-sm leading-relaxed ${
            isOwn
              ? "bg-white text-black rounded-br-sm"
              : "bg-zinc-800 text-white rounded-bl-sm"
          }`}
        >
          {msg.content}
        </div>
      </div>
    </div>
  );
}

function MessageList({ roomId }: { roomId: number }) {
  const { user } = useAuth();
  const { data: messages = [] } = useQuery({
    queryKey: ["chat", "messages", roomId],
    queryFn: () => chatApi.getMessages(roomId),
  });

  useChatWebSocket(roomId);

  return (
    <ScrollArea className="flex-1 px-4 py-3">
      <div className="flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-center text-white/30 text-sm py-8">No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} msg={msg} isOwn={msg.userId === user?.id} />
        ))}
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
        prev ? [...prev, msg] : [msg]
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
