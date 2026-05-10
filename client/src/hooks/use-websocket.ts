import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface WsMessage {
  type: string;
  roomId: number;
  message: {
    id: number;
    roomId: number;
    userId: number;
    username: string;
    content: string;
    mediaUrl: string | null;
    createdAt: string;
  };
}

export function useChatWebSocket(roomId: number | null) {
  const ws = useRef<WebSocket | null>(null);
  const qc = useQueryClient();
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!roomId) return;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/ws/chat/${roomId}`;
    ws.current = new WebSocket(url);

    ws.current.onmessage = (event) => {
      const msg: WsMessage = JSON.parse(event.data);
      if (msg.type === "message" && msg.roomId === roomId) {
        qc.setQueryData<WsMessage["message"][]>(["chat", "messages", roomId], (prev) =>
          prev ? [...prev, msg.message] : [msg.message]
        );
      }
    };

    ws.current.onclose = () => {
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.current.onerror = () => {
      ws.current?.close();
    };
  }, [roomId, qc]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  const send = useCallback((data: unknown) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}
