import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi, roomTitle, type Room } from "../../api/chat.js";
import { ChevronLeft, Bot, ImageIcon } from "lucide-react";
import { Button } from "../ui/button.js";
import type { TypingUser } from "../../hooks/use-websocket.js";

interface Props {
  room: Room;
  typingUsers: TypingUser[];
  onBack: () => void;
}

export function MessageThread({ room, typingUsers, onBack }: Props) {
  const qc = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["chat", "messages", room.id],
    queryFn: () => chatApi.getMessages(room.id),
  });

  // Mark room as read when opened
  useEffect(() => {
    chatApi.markRead(room.id).then(() => {
      qc.setQueryData<Room[]>(["chat", "rooms"], (prev) =>
        prev?.map((r) => (r.id === room.id ? { ...r, unreadCount: 0 } : r))
      );
    }).catch(() => {});
  }, [room.id, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, typingUsers.length]);

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-2 py-2 border-b border-white/10 shrink-0">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-white/50 hover:text-white shrink-0"
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-white truncate block">
            {roomTitle(room)}
          </span>
        </div>
        <span className="text-xs text-white/30 shrink-0 pr-2">
          @BigMo to ask anything
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {messages.length === 0 && (
          <p className="text-center text-white/30 text-sm py-10">
            No messages yet.{" "}
            <span className="text-white/40">Try saying hi, or type @BigMo.</span>
          </p>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span
                className={`text-xs font-semibold ${
                  msg.isBot ? "text-blue-400" : "text-white/70"
                }`}
              >
                {msg.displayName ?? msg.username}
              </span>
              {msg.isBot && (
                <Bot className="h-3 w-3 text-blue-400/60 shrink-0" />
              )}
              <span className="text-xs text-white/25">{formatTime(msg.createdAt)}</span>
            </div>
            {msg.mediaUrl ? (
              <div className="pl-0 mt-1">
                <img
                  src={msg.mediaUrl}
                  alt="attachment"
                  className="max-w-xs max-h-64 rounded-lg object-cover border border-white/10 cursor-pointer"
                  onClick={() => window.open(msg.mediaUrl!, "_blank")}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
                {msg.content && (
                  <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap break-words mt-1">
                    {msg.content}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap break-words">
                {msg.content}
              </p>
            )}
          </div>
        ))}

        {typingUsers.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-white/40 italic">
            <Bot className="h-3 w-3 shrink-0" />
            <span>
              {typingUsers.map((u) => u.displayName ?? u.username).join(", ")} is
              typing…
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
