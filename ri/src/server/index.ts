import "dotenv/config";
import http from "http";
import { app } from "./app.js";
import { initProvider } from "./llm/provider.js";
import { seedDefaultUser } from "./db/seed-default-user.js";
import { seedBots } from "./db/seed-bots.js";

const PORT = parseInt(process.env.PORT ?? "3000");

const server = http.createServer(app);

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

try {
  await seedBots();
} catch (err) {
  process.stderr.write(`Bot seed failed: ${err}\n`);
}

server.listen(PORT, () => {
  process.stdout.write(`Server listening on http://localhost:${PORT}\n`);
});
