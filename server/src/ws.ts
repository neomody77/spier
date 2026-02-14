import type { ServerWebSocket } from "bun";
import type {
  ExtensionMessage,
  ServerRequest,
  SpierEvent,
  SpierEventType,
} from "../../shared/types.js";
import { store } from "./store.js";

export interface WsData {
  role: "extension" | "subscriber";
  types?: SpierEventType[];
  tabId?: number;
}

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let extensionWs: ServerWebSocket<WsData> | null = null;
const subscribers = new Set<ServerWebSocket<WsData>>();
const pendingRequests = new Map<string, PendingRequest>();
let reqCounter = 0;

export function isExtensionConnected(): boolean {
  return extensionWs !== null;
}

export function subscriberCount(): number {
  return subscribers.size;
}

export function handleOpen(ws: ServerWebSocket<WsData>) {
  if (ws.data.role === "extension") {
    if (extensionWs) extensionWs.close(1000, "replaced");
    extensionWs = ws;
    console.log("[ws] extension connected");
  } else {
    subscribers.add(ws);
    console.log(`[ws] subscriber connected (total: ${subscribers.size})`);
  }
}

export function handleClose(ws: ServerWebSocket<WsData>) {
  if (ws.data.role === "extension") {
    if (extensionWs === ws) {
      extensionWs = null;
      for (const [id, req] of pendingRequests) {
        clearTimeout(req.timer);
        req.reject(new Error("extension disconnected"));
        pendingRequests.delete(id);
      }
      console.log("[ws] extension disconnected");
    }
  } else {
    subscribers.delete(ws);
    console.log(`[ws] subscriber disconnected (total: ${subscribers.size})`);
  }
}

export function handleMessage(ws: ServerWebSocket<WsData>, raw: string | Buffer) {
  if (ws.data.role !== "extension") return;

  const msg: ExtensionMessage = JSON.parse(
    typeof raw === "string" ? raw : raw.toString()
  );

  switch (msg.type) {
    case "event":
      store.addEvent(msg.data);
      broadcastToSubscribers(msg.data);
      break;
    case "snapshot": {
      const pending = pendingRequests.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(msg.data);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }
    case "tabs": {
      const pending = pendingRequests.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(msg.tabs);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }
  }
}

function broadcastToSubscribers(event: SpierEvent) {
  const json = JSON.stringify(event);
  for (const sub of subscribers) {
    if (sub.data.tabId != null && sub.data.tabId !== event.tabId) continue;
    if (sub.data.types && sub.data.types.length > 0 && !sub.data.types.includes(event.type)) continue;
    sub.send(json);
  }
}

export function requestSnapshot(
  request: Omit<ServerRequest, "requestId">,
  timeoutMs = 10000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!extensionWs) return reject(new Error("extension not connected"));

    const requestId = `req_${++reqCounter}_${Date.now()}`;
    const fullMessage = { ...request, requestId };
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("request timed out"));
    }, timeoutMs);

    pendingRequests.set(requestId, { resolve, reject, timer });
    extensionWs.send(JSON.stringify(fullMessage));
  });
}
