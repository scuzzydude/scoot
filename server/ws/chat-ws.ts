import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";

interface RoomClient {
  ws: WebSocket;
  userId: number;
  username: string;
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

export function setupChatWS(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws/chat" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // URL: /ws/chat/:roomId  — roomId extracted from query or path
    const url = new URL(req.url ?? "/", "ws://localhost");
    const parts = url.pathname.split("/");
    const roomId = parseInt(parts[parts.length - 1]);

    // Auth: session user attached by express-session — we use a simpler approach
    // The session cookie is parsed by the HTTP handler; for WS we read the user
    // from the upgrade request's session (attached by the session middleware).
    const session = (req as IncomingMessage & { session?: { passport?: { user?: number }; username?: string } }).session;
    const userId = session?.passport?.user;
    if (!userId || isNaN(roomId)) {
      ws.close(1008, "Unauthorized");
      return;
    }

    const client: RoomClient = { ws, userId, username: "" };
    getRoomClients(roomId).add(client);

    ws.on("close", () => {
      getRoomClients(roomId).delete(client);
    });

    ws.on("error", () => {
      getRoomClients(roomId).delete(client);
    });
  });

  return wss;
}
