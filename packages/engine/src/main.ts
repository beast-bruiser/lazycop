#!/usr/bin/env node
// Starts the LazyCop engine server (port from LAZYCOP_PORT, default 4747).
import { startServer } from "./server.js";

try {
  await startServer();
} catch (err) {
  const busy = (err as NodeJS.ErrnoException).code === "EADDRINUSE";
  console.error(busy ? "LazyCop is already running on this port (set LAZYCOP_PORT to use another)." : err);
  process.exit(1);
}
