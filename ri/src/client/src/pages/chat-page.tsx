import { useState } from "react";
import {
  ChatProvider,
  RoomList,
  MessageThread,
  MessageInput,
  useChatWebSocket,
  type Room,
} from "scoot-chat";

export default function ChatPage() {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const { send, typingUsers } = useChatWebSocket(selectedRoom?.id ?? null);

  return (
    <ChatProvider apiBase="/api/v1" botHint="@BigMo to ask anything">
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
    </ChatProvider>
  );
}
