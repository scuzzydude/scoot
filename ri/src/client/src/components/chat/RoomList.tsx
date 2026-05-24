import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { chatApi, roomTitle, type Room } from "../../api/chat.js";
import { Button } from "../ui/button.js";
import { Input } from "../ui/input.js";
import { Plus, MessageSquare, User } from "lucide-react";

interface Props {
  selectedRoomId: number | null;
  onSelectRoom: (room: Room) => void;
}

export function RoomList({ selectedRoomId, onSelectRoom }: Props) {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: rooms = [] } = useQuery({
    queryKey: ["chat", "rooms"],
    queryFn: () => chatApi.getRooms(),
  });

  const createRoom = useMutation({
    mutationFn: (name: string) => chatApi.createRoom({ name }),
    onSuccess: (room) => {
      qc.invalidateQueries({ queryKey: ["chat", "rooms"] });
      setShowNew(false);
      setNewName("");
      onSelectRoom(room);
    },
  });

  function formatTime(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name) createRoom.mutate(name);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <span className="text-sm font-semibold text-white">Chat</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-white/50 hover:text-white"
          onClick={() => setShowNew((v) => !v)}
          title="New room"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {showNew && (
        <form
          className="flex gap-2 px-3 py-2 border-b border-white/10 shrink-0"
          onSubmit={handleCreate}
        >
          <Input
            autoFocus
            className="h-8 text-sm bg-white/5 border-white/10 text-white placeholder:text-white/30"
            placeholder="Room name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={64}
          />
          <Button
            size="sm"
            type="submit"
            disabled={!newName.trim() || createRoom.isPending}
          >
            Create
          </Button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto">
        {rooms.length === 0 && (
          <p className="px-4 py-10 text-center text-white/30 text-sm">
            No rooms yet.
            <br />
            Tap + to create one.
          </p>
        )}

        {rooms.map((room) => {
          const active = selectedRoomId === room.id;
          return (
            <button
              key={room.id}
              className={`w-full text-left px-4 py-3 border-b border-white/5 transition-colors ${
                active ? "bg-white/10" : "hover:bg-white/5"
              }`}
              onClick={() => onSelectRoom(room)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {room.isDm ? (
                    <User className="h-3.5 w-3.5 text-white/30 shrink-0" />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5 text-white/30 shrink-0" />
                  )}
                  <span className="text-sm font-medium text-white truncate">
                    {roomTitle(room)}
                  </span>
                </div>
                {room.lastMessage && (
                  <span className="text-xs text-white/30 shrink-0">
                    {formatTime(room.lastMessage.createdAt)}
                  </span>
                )}
              </div>
              {room.lastMessage && (
                <p className="text-xs text-white/40 mt-0.5 pl-[22px] truncate">
                  {room.lastMessage.content}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
