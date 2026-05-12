import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface ChatWsMessagePayload {
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

interface WsMessageEnvelope {
  type: "message";
  roomId: number;
  message: ChatWsMessagePayload;
}

interface WsTypingEnvelope {
  type: "typing";
  roomId: number;
  userId: number;
  username: string;
  displayName: string | null;
}

interface WsTypingStopEnvelope {
  type: "typing_stop";
  roomId: number;
  userId: number;
}

type WsEnvelope = WsMessageEnvelope | WsTypingEnvelope | WsTypingStopEnvelope;

export interface TypingUser {
  userId: number;
  username: string;
  displayName: string | null;
}

const TYPING_TIMEOUT_MS = 30000;

export function useChatWebSocket(roomId: number | null) {
  const ws = useRef<WebSocket | null>(null);
  const qc = useQueryClient();
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  const removeTyping = useCallback((userId: number) => {
    const timer = typingTimers.current.get(userId);
    if (timer) {
      clearTimeout(timer);
      typingTimers.current.delete(userId);
    }
    setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
  }, []);

  const addTyping = useCallback(
    (user: TypingUser) => {
      const existing = typingTimers.current.get(user.userId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => removeTyping(user.userId), TYPING_TIMEOUT_MS);
      typingTimers.current.set(user.userId, timer);
      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === user.userId)) return prev;
        return [...prev, user];
      });
    },
    [removeTyping]
  );

  const connect = useCallback(() => {
    if (!roomId) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/ws/chat/${roomId}`;
    ws.current = new WebSocket(url);

    ws.current.onmessage = (event) => {
      const envelope = JSON.parse(event.data) as WsEnvelope;
      if (envelope.roomId !== roomId) return;

      if (envelope.type === "message") {
        removeTyping(envelope.message.userId);
        qc.setQueryData<ChatWsMessagePayload[]>(["chat", "messages", roomId], (prev) =>
          prev ? [...prev, envelope.message] : [envelope.message]
        );
      } else if (envelope.type === "typing") {
        addTyping({
          userId: envelope.userId,
          username: envelope.username,
          displayName: envelope.displayName,
        });
      } else if (envelope.type === "typing_stop") {
        removeTyping(envelope.userId);
      }
    };

    ws.current.onclose = () => {
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.current.onerror = () => {
      ws.current?.close();
    };
  }, [roomId, qc, addTyping, removeTyping]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      for (const t of typingTimers.current.values()) clearTimeout(t);
      typingTimers.current.clear();
      setTypingUsers([]);
      ws.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  return { send, typingUsers };
}
