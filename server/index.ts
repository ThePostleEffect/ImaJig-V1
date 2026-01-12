import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const basePort = Number(process.env.PORT) || 3000;
  const maxAttempts = 10;

  const listenWithFallback = (port: number, attemptsLeft: number) => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
        const nextPort = port + 1;
        console.warn(`Port ${port} in use, trying ${nextPort}...`);
        listenWithFallback(nextPort, attemptsLeft - 1);
        return;
      }
      throw err;
    });

    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}/`);
      if (port !== basePort) {
        console.log(`Set PORT to choose a specific port (e.g. PORT=3000).`);
      }
    });
  };

  listenWithFallback(basePort, maxAttempts);
}

startServer().catch(console.error);
