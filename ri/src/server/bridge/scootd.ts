import net from "net";
import { randomUUID } from "crypto";
import { EventEmitter } from "events";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class ScootdBridge extends EventEmitter {
  private socket: net.Socket | null = null;
  private pending = new Map<string, PendingRequest>();
  private buffer = "";
  private socketPath: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.socketPath = process.env.SCOOTD_SOCKET ?? "/tmp/scootd.sock";
  }

  connect() {
    if (this.socket) return;
    this.socket = net.createConnection(this.socketPath);

    this.socket.on("connect", () => {
      this.emit("connected");
    });

    this.socket.on("data", (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          this.handleResponse(JSON.parse(line));
        } catch {
          // malformed line — discard
        }
      }
    });

    this.socket.on("close", () => {
      this.socket = null;
      this.rejectAll(new Error("scootd socket closed"));
      this.scheduleReconnect();
    });

    this.socket.on("error", () => {
      // error is followed by close
    });
  }

  private handleResponse(msg: Record<string, unknown>) {
    const reqId = msg.req_id as string;
    const pending = this.pending.get(reqId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(reqId);
    if (msg.ok === false) {
      pending.reject(new Error((msg.error as string) ?? "scootd error"));
    } else {
      pending.resolve(msg);
    }
  }

  private rejectAll(err: Error) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 3000);
  }

  send(cmd: Record<string, unknown>, timeoutMs = 5000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("scootd not connected"));
        return;
      }
      const req_id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(req_id);
        reject(new Error(`scootd timeout for cmd ${cmd.cmd}`));
      }, timeoutMs);

      this.pending.set(req_id, { resolve, reject, timer });
      this.socket.write(JSON.stringify({ ...cmd, req_id }) + "\n");
    });
  }
}

export const scootd = new ScootdBridge();
