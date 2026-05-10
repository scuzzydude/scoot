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
import { Separator } from "../components/ui/separator.js";
import { Avatar, AvatarFallback } from "../components/ui/avatar.js";
import { Plus, Send } from "lucide-react";

function MessageBubble({ msg, isOwn }: { msg: Message; isOwn: boolean }) {
  return (
    <div className={`flex items-end gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
      {!isOwn && (
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarFallback className="text-[10px]">{msg.userId.toString().slice(0, 2)}</AvatarFallback>
        </Avatar>
      )}
      <div
        className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
          isOwn ? "bg-primary text-primary-foreground" : "bg-muted text-white"
        }`}
      >
        {msg.content}
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
      className="flex gap-2 p-3 border-t border-border"
    >
      <Input
        {...register("content")}
        placeholder="Message…"
        className="flex-1"
        autoComplete="off"
      />
      <Button type="submit" size="icon" disabled={sendMutation.isPending}>
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
      <Input {...register("name")} placeholder="New room…" className="flex-1 h-8 text-sm" />
      <Button type="submit" size="icon" className="h-8 w-8">
        <Plus className="h-3 w-3" />
      </Button>
    </form>
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
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-border flex flex-col">
        <div className="px-4 py-3">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Rooms</p>
        </div>
        <ScrollArea className="flex-1">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setActiveRoomId(room.id)}
              className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-accent ${
                room.id === activeRoomId ? "bg-accent text-white" : "text-white/70"
              }`}
            >
              # {room.name}
            </button>
          ))}
        </ScrollArea>
        <NewRoomForm onCreated={(room) => {
          qc.setQueryData<Room[]>(["chat", "rooms"], (prev) => prev ? [...prev, room] : [room]);
          setActiveRoomId(room.id);
        }} />
      </aside>

      {/* Chat area */}
      <div className="flex flex-1 flex-col">
        {activeRoom ? (
          <>
            <div className="px-4 py-3 border-b border-border">
              <p className="font-semibold"># {activeRoom.name}</p>
            </div>
            <MessageList roomId={activeRoom.id} />
            <MessageInput roomId={activeRoom.id} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-white/40 text-sm">
            Select a room or create one
          </div>
        )}
      </div>
    </div>
  );
}
