import { useState } from "react";
import {
  ChatProvider,
  RoomList,
  MessageThread,
  MessageInput,
  useChatWebSocket,
  type Room,
} from "scoot-chat";
import { useScoot } from "@/hooks/use-scoot";
import { useLayoutMode } from "../hooks/use-layout-mode.js";
import { useDesktopSlots } from "../components/layout/desktop-shell.js";
import { MessageSquare } from "lucide-react";

function ChatPageInner() {
  const { mode } = useLayoutMode();
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const { send, typingUsers } = useChatWebSocket(selectedRoom?.id ?? null);

  // Desktop: room list docks in the shell's sidebar, always visible --
  // selecting a room never hides it (no list/thread swap like mobile).
  const slots = useDesktopSlots({
    sidebar: mode === "desktop" ? <RoomList selectedRoomId={selectedRoom?.id ?? null} onSelectRoom={setSelectedRoom} /> : undefined,
  });

  if (mode === "desktop") {
    return (
      <>
        {slots}
        <div className="flex flex-col h-full min-h-0" style={{ height: "calc(100vh - 3.5rem)" }}>
          {selectedRoom ? (
            <>
              <MessageThread room={selectedRoom} typingUsers={typingUsers} onBack={() => setSelectedRoom(null)} />
              <MessageInput roomId={selectedRoom.id} sendWs={send} />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-white/30 gap-2">
              <MessageSquare className="h-8 w-8" />
              <p className="text-sm">Pick a room from the sidebar</p>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 7rem)" }}>
      {selectedRoom === null ? (
        <RoomList selectedRoomId={null} onSelectRoom={setSelectedRoom} />
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <MessageThread room={selectedRoom} typingUsers={typingUsers} onBack={() => setSelectedRoom(null)} />
          <MessageInput roomId={selectedRoom.id} sendWs={send} />
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const { activeScoot } = useScoot();
  return (
    <ChatProvider
      apiBase="/api/v1"
      botHint="@BigMo to ask anything"
      title={activeScoot?.name ?? "Chat"}
      userFlags={activeScoot?.userFlags ?? "0"}
    >
      <ChatPageInner />
    </ChatProvider>
  );
}
