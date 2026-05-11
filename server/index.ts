import "dotenv/config";
import http from "http";
import { app, sessionMiddleware } from "./app.js";
import { setupChatWS } from "./ws/chat-ws.js";
import { initProvider } from "./llm/provider.js";
import { seedDefaultUser } from "./db/seed-default-user.js";

const PORT = parseInt(process.env.PORT ?? "3000");

const server = http.createServer(app);
setupChatWS(server, sessionMiddleware);

try {
  await seedDefaultUser();
} catch (err) {
  process.stderr.write(`Default user seed failed: ${err}\n`);
}

try {
  await initProvider();
} catch (err) {
  process.stderr.write(`LLM provider init failed: ${err}\n`);
}

server.listen(PORT, () => {
  process.stdout.write(`Server listening on http://localhost:${PORT}\n`);
});
