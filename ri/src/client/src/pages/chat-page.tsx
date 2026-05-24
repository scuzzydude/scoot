import { useState } from "react";
import { RoomList } from "../components/chat/RoomList.js";
import { MessageThread } from "../components/chat/MessageThread.js";
import { MessageInput } from "../components/chat/MessageInput.js";
import { useChatWebSocket } from "../hooks/use-websocket.js";
import type { Room } from "../api/chat.js";

export default function ChatPage() {
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const { send, typingUsers } = useChatWebSocket(selectedRoom?.id ?? null);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 7rem)" }}>
      {selectedRoom === null ? (
        <RoomList selectedRoomId={null} onSelectRoom={setSelectedRoom} />
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          <MessageThread
            room={selectedRoom}
            typingUsers={typingUsers}
            onBack={() => setSelectedRoom(null)}
          />
          <MessageInput roomId={selectedRoom.id} sendWs={send} />
        </div>
      )}
    </div>
  );
}
