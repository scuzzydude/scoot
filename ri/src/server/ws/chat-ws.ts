import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import type { RequestHandler } from "express";

interface RoomClient {
  ws: WebSocket;
  userId: number;
}

const rooms = new Map<number, Set<RoomClient>>();

function getRoomClients(roomId: number): Set<RoomClient> {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  return rooms.get(roomId)!;
}

export function broadcast(roomId: number, payload: unknown) {
  const clients = getRoomClients(roomId);
  const data = JSON.stringify(payload);
  for (const client of clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  }
}

export function setupChatWS(server: Server, sessionMiddleware: RequestHandler) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/ws/chat/")) {
      socket.destroy();
      return;
    }

    sessionMiddleware(
      req as Parameters<RequestHandler>[0],
      {} as Parameters<RequestHandler>[1],
      () => {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      }
    );
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/");
    const roomId = parseInt(parts[parts.length - 1]);

    const session = (req as IncomingMessage & { session?: { passport?: { user?: number } } }).session;
    const userId = session?.passport?.user;

    if (!userId || isNaN(roomId)) {
      ws.close(1008, "Unauthorized");
      return;
    }

    const client: RoomClient = { ws, userId };
    getRoomClients(roomId).add(client);

    ws.on("close", () => getRoomClients(roomId).delete(client));
    ws.on("error", () => getRoomClients(roomId).delete(client));
  });

  return wss;
}
