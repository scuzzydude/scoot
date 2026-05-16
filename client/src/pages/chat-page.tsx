import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { chatApi, roomTitle, type Room, type Message, type Peer, type Member } from "../api/chat.js";
import { createRoomSchema, sendMessageSchema, type CreateRoomInput, type SendMessageInput } from "@shared/schema.js";
import { useChatWebSocket, upsertMessage, patchRoomLastMessage, type TypingUser } from "../hooks/use-websocket.js";
import { useAuth } from "../hooks/use-auth.js";
import { Button } from "../components/ui/button.js";
import { Input } from "../components/ui/input.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { Avatar, AvatarFallback } from "../components/ui/avatar.js";
import { Bot, ChevronLeft, Plus, Send, Users, X } from "lucide-react";

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
  const title = roomTitle(room);
  const prefix = room.isDm ? "" : "# ";
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 border-b border-border/40 transition-colors hover:bg-zinc-900 ${
        active ? "bg-zinc-900" : ""
      }`}
    >
      <span className="text-sm font-medium text-white">{prefix}{title}</span>
      {room.lastMessage ? (
        <span className="text-xs text-white/40 truncate">{room.lastMessage.content}</span>
      ) : (
        <span className="text-xs text-white/25 italic">No messages yet</span>
      )}
    </button>
  );
}

function DmPicker({
  onPick,
  onClose,
}: {
  onPick: (peer: Peer) => void;
  onClose: () => void;
}) {
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["chat", "users"],
    queryFn: chatApi.getUsers,
  });

  return (
    <div className="border-t border-border bg-zinc-950">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Start a DM
        </span>
        <button onClick={onClose} className="text-white/40 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <ScrollArea className="max-h-56">
        {isLoading && (
          <p className="text-xs text-white/30 px-3 py-3">Loading…</p>
        )}
        {!isLoading && users.length === 0 && (
          <p className="text-xs text-white/30 px-3 py-3">No other users yet.</p>
        )}
        {users.map((u) => {
          const name = u.displayName ?? u.username;
          return (
            <button
              key={u.id}
              onClick={() => onPick(u)}
              className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-zinc-900 transition-colors"
            >
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className="text-[10px]">
                  {name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-white">{name}</span>
              {u.displayName && (
                <span className="text-xs text-white/40">@{u.username}</span>
              )}
            </button>
          );
        })}
      </ScrollArea>
    </div>
  );
}

function MembersPanel({
  roomId,
  onClose,
}: {
  roomId: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["chat", "members", roomId],
    queryFn: () => chatApi.getMembers(roomId),
  });
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["chat", "users"],
    queryFn: chatApi.getUsers,
  });

  const memberIds = new Set(members.map((m) => m.id));
  const addable = users.filter((u) => !memberIds.has(u.id));

  const addMutation = useMutation({
    mutationFn: (userId: number) => chatApi.addMember(roomId, userId),
    onSuccess: (newMember) => {
      qc.setQueryData<Member[]>(["chat", "members", roomId], (prev) => {
        if (!prev) return [newMember];
        if (prev.some((m) => m.id === newMember.id)) return prev;
        return [...prev, newMember];
      });
    },
  });

  return (
    <div className="border-b border-border bg-zinc-950">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          Members ({members.length})
        </span>
        <button onClick={onClose} className="text-white/40 hover:text-white" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-72 overflow-auto">
        {membersLoading && <p className="text-xs text-white/30 px-4 py-3">Loading…</p>}
        {members.map((m) => {
          const name = m.displayName ?? m.username;
          return (
            <div
              key={m.id}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white"
            >
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className={`text-[10px] ${m.isBot ? "bg-sky-900 text-sky-200" : ""}`}>
                  {m.isBot ? <Bot className="h-3 w-3" /> : name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span>{name}</span>
              {m.isBot && (
                <span className="text-[9px] uppercase tracking-wider text-sky-400/80 bg-sky-950/60 px-1 rounded">
                  bot
                </span>
              )}
            </div>
          );
        })}
        {!membersLoading && addable.length > 0 && (
          <div className="border-t border-border/40 mt-1 pt-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30 px-4 py-2">
              Add member
            </p>
            {usersLoading && <p className="text-xs text-white/30 px-4 py-2">Loading…</p>}
            {addable.map((u) => {
              const name = u.displayName ?? u.username;
              return (
                <button
                  key={u.id}
                  onClick={() => addMutation.mutate(u.id)}
                  disabled={addMutation.isPending}
                  className="w-full text-left px-4 py-2 flex items-center gap-2 hover:bg-zinc-900 transition-colors disabled:opacity-50"
                >
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="text-[10px]">
                      {name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-white">{name}</span>
                  <Plus className="h-3 w-3 text-white/40 ml-auto" />
                </button>
              );
            })}
          </div>
        )}
        {!membersLoading && !usersLoading && addable.length === 0 && (
          <p className="text-xs text-white/30 italic px-4 py-3">
            All users are in this room.
          </p>
        )}
        {addMutation.isError && (
          <p className="text-xs text-red-400 px-4 py-2">
            {(addMutation.error as Error)?.message ?? "Failed to add member"}
          </p>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  label,
  action,
}: {
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
      <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">{label}</p>
      {action}
    </div>
  );
}

export default function ChatPage() {
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const qc = useQueryClient();

  const { data: rooms = [] } = useQuery({
    queryKey: ["chat", "rooms"],
    queryFn: chatApi.getRooms,
  });

  const dms = rooms.filter((r) => r.isDm);
  const named = rooms.filter((r) => !r.isDm);
  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  const dmMutation = useMutation({
    mutationFn: (peerId: number) => chatApi.getOrCreateDm(peerId),
    onSuccess: (room) => {
      qc.setQueryData<Room[]>(["chat", "rooms"], (prev) => {
        if (!prev) return [room];
        if (prev.some((r) => r.id === room.id)) return prev;
        return [room, ...prev];
      });
      setPickerOpen(false);
      setActiveRoomId(room.id);
    },
  });

  const headerTitle = activeRoom
    ? activeRoom.isDm
      ? roomTitle(activeRoom)
      : `# ${roomTitle(activeRoom)}`
    : "";

  return (
    <div className={`flex ${FULL_H} overflow-hidden`}>
      {/* Sidebar */}
      <aside
        className={`${
          activeRoomId !== null ? "hidden md:flex" : "flex"
        } w-full md:w-72 md:shrink-0 flex-col border-r border-border bg-black`}
      >
        <ScrollArea className="flex-1">
          <SectionHeader
            label="Direct messages"
            action={
              <button
                onClick={() => setPickerOpen((v) => !v)}
                className="text-white/50 hover:text-white transition-colors"
                aria-label="New DM"
              >
                <Plus className="h-4 w-4" />
              </button>
            }
          />
          {pickerOpen && (
            <DmPicker
              onPick={(peer) => dmMutation.mutate(peer.id)}
              onClose={() => setPickerOpen(false)}
            />
          )}
          {dms.length === 0 && !pickerOpen && (
            <p className="text-xs text-white/25 italic px-4 py-3">No DMs yet</p>
          )}
          {dms.map((room) => (
            <RoomRow
              key={room.id}
              room={room}
              active={room.id === activeRoomId}
              onClick={() => setActiveRoomId(room.id)}
            />
          ))}

          <SectionHeader label="Rooms" />
          {named.length === 0 && (
            <p className="text-xs text-white/25 italic px-4 py-3">No rooms yet</p>
          )}
          {named.map((room) => (
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
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
              <button
                onClick={() => {
                  setActiveRoomId(null);
                  setMembersOpen(false);
                }}
                className="md:hidden text-white/60 hover:text-white transition-colors"
                aria-label="Back"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <p className="font-semibold text-sm flex-1">{headerTitle}</p>
              {!activeRoom.isDm && (
                <button
                  onClick={() => setMembersOpen((v) => !v)}
                  className={`text-white/50 hover:text-white transition-colors ${
                    membersOpen ? "text-white" : ""
                  }`}
                  aria-label="Members"
                >
                  <Users className="h-4 w-4" />
                </button>
              )}
            </div>
            {membersOpen && !activeRoom.isDm && (
              <MembersPanel
                roomId={activeRoom.id}
                onClose={() => setMembersOpen(false)}
              />
            )}
            <MessageList roomId={activeRoom.id} />
            <MessageInput roomId={activeRoom.id} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-white/25 text-sm">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}
