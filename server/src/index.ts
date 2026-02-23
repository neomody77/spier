import { createServer } from "node:http";
import { serve } from "@hono/node-server";
import { app } from "./http.js";
import { createWss, handleUpgrade } from "./ws.js";
import { log } from "./logger.js";

function parseArgs() {
  const args = process.argv.slice(2);
  let port = 12333;
  let host = "0.0.0.0";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
      port = Number(args[i + 1]);
      i++;
    } else if (args[i] === "--host" && args[i + 1]) {
      host = args[i + 1];
      i++;
    }
  }
  return { port, host };
}

const { port, host } = parseArgs();

process.title = "spier-server";

const wss = createWss();

const server = serve({
  fetch: app.fetch,
  port,
  hostname: host,
  createServer,
});

server.on("upgrade", (req, socket, head) => {
  handleUpgrade(wss, req, socket, head);
});

log.system(`Spier server running on http://${host}:${port}`);
log.system(`  Extension WS: ws://${host}:${port}/extension`);
log.system(`  Subscribe WS: ws://${host}:${port}/subscribe`);
