import type { ServerWebSocket } from "bun";
import type {
  ExtensionMessage,
  ServerRequest,
  SpierEvent,
  SpierEventType,
} from "../../shared/types.js";
import { store } from "./store.js";
import { log } from "./logger.js";

export interface WsData {
  role: "extension" | "subscriber";
  types?: SpierEventType[];
  tabId?: number;
}

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  type: string;
  startTime: number;
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
    if (extensionWs) {
      log.warn("new extension connected — replacing previous connection");
      extensionWs.close(1000, "replaced");
    }
    extensionWs = ws;
    log.wsConnect("extension");
  } else {
    subscribers.add(ws);
    log.wsConnect("subscriber", `total: ${subscribers.size}`);
  }
}

export function handleClose(ws: ServerWebSocket<WsData>) {
  if (ws.data.role === "extension") {
    if (extensionWs === ws) {
      extensionWs = null;
      for (const [id, req] of pendingRequests) {
        clearTimeout(req.timer);
        const duration = Date.now() - req.startTime;
        log.requestFailed(id, req.type, "extension disconnected", duration);
        req.reject(new Error("extension disconnected"));
        pendingRequests.delete(id);
      }
      log.wsDisconnect("extension");
    }
  } else {
    subscribers.delete(ws);
    log.wsDisconnect("subscriber", `total: ${subscribers.size}`);
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
      log.eventIngested(msg.data.type, msg.data.tabId);
      broadcastToSubscribers(msg.data);
      break;
    case "snapshot": {
      const pending = pendingRequests.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        log.requestResolved(msg.requestId, pending.type, Date.now() - pending.startTime);
        pending.resolve(msg.data);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }
    case "tabs": {
      const pending = pendingRequests.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        log.requestResolved(msg.requestId, pending.type, Date.now() - pending.startTime);
        pending.resolve(msg.tabs);
        pendingRequests.delete(msg.requestId);
      }
      break;
    }
    case "result": {
      const pending = pendingRequests.get(msg.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        const duration = Date.now() - pending.startTime;
        if (msg.success) {
          log.requestResolved(msg.requestId, pending.type, duration);
          pending.resolve(msg.data);
        } else {
          log.requestFailed(msg.requestId, pending.type, msg.error || "unknown error", duration);
          pending.reject(new Error(msg.error || "request failed"));
        }
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
    const startTime = Date.now();
    const fullMessage = { ...request, requestId };
    const tabId = 'tabId' in request ? (request as any).tabId : undefined;

    const timer = setTimeout(() => {
      const duration = Date.now() - startTime;
      log.requestFailed(requestId, request.type, "request timed out", duration);
      pendingRequests.delete(requestId);
      reject(new Error("request timed out"));
    }, timeoutMs);

    pendingRequests.set(requestId, { resolve, reject, timer, type: request.type, startTime });
    log.requestSent(requestId, request.type, tabId);
    const { type: _, ...params } = request;
    log.actionDetail(params);
    extensionWs.send(JSON.stringify(fullMessage));
  });
}
