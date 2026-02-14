import type { SpierEventType } from "../../shared/types.js";
import { app } from "./http.js";
import * as ws from "./ws.js";
import type { WsData } from "./ws.js";
import { log } from "./logger.js";

function parseArgs() {
  const args = process.argv.slice(2);
  let port = 12333;
  let host = "localhost";

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

Bun.serve<WsData>({
  port,
  hostname: host,

  fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/extension") {
      const upgraded = server.upgrade(req, {
        data: { role: "extension" as const },
      });
      return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    }

    if (url.pathname === "/subscribe") {
      const typesParam = url.searchParams.get("types");
      const tabIdParam = url.searchParams.get("tabId");

      const data: WsData = {
        role: "subscriber" as const,
        types: typesParam
          ? (typesParam.split(",").filter(Boolean) as SpierEventType[])
          : undefined,
        tabId: tabIdParam ? Number(tabIdParam) : undefined,
      };

      const upgraded = server.upgrade(req, { data });
      return upgraded ? undefined : new Response("WebSocket upgrade failed", { status: 400 });
    }

    return app.fetch(req);
  },

  websocket: {
    open(wsConn) {
      ws.handleOpen(wsConn);
    },
    close(wsConn) {
      ws.handleClose(wsConn);
    },
    message(wsConn, message) {
      ws.handleMessage(wsConn, message);
    },
  },
});

log.system(`Spier server running on http://${host}:${port}`);
log.system(`  Extension WS: ws://${host}:${port}/extension`);
log.system(`  Subscribe WS: ws://${host}:${port}/subscribe`);
