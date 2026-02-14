import { Hono } from "hono";
import { cors } from "hono/cors";
import type {
  StorageSnapshot,
  DOMSnapshot,
  ScreenshotData,
  TabInfo,
} from "../../shared/types.js";
import { store } from "./store.js";
import * as ws from "./ws.js";

export const app = new Hono();

app.use("*", cors());

app.get("/", (c) => {
  return c.json({
    status: "ok",
    extensionConnected: ws.isExtensionConnected(),
    subscriberCount: ws.subscriberCount(),
  });
});

app.get("/tabs", async (c) => {
  try {
    const tabs = (await ws.requestSnapshot({ type: "getTabs" })) as TabInfo[];
    return c.json(tabs);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

app.get("/events", (c) => {
  const type = c.req.query("type") as any;
  const tabId = c.req.query("tabId");
  const limit = c.req.query("limit");

  const events = store.getEvents({
    type: type || undefined,
    tabId: tabId ? Number(tabId) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  return c.json(events);
});

app.get("/events/network", (c) => {
  const tabId = c.req.query("tabId");
  const limit = c.req.query("limit");
  const url = c.req.query("url");
  const method = c.req.query("method");

  const events = store.getNetworkEvents({
    tabId: tabId ? Number(tabId) : undefined,
    limit: limit ? Number(limit) : undefined,
    url: url || undefined,
    method: method || undefined,
  });
  return c.json(events);
});

app.get("/events/console", (c) => {
  const tabId = c.req.query("tabId");
  const limit = c.req.query("limit");
  const level = c.req.query("level");

  const events = store.getConsoleEvents({
    tabId: tabId ? Number(tabId) : undefined,
    limit: limit ? Number(limit) : undefined,
    level: level || undefined,
  });
  return c.json(events);
});

app.get("/events/errors", (c) => {
  const tabId = c.req.query("tabId");
  const limit = c.req.query("limit");

  const events = store.getErrors({
    tabId: tabId ? Number(tabId) : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  return c.json(events);
});

app.post("/snapshot/storage", async (c) => {
  const body = await c.req.json<{ tabId: number }>();
  try {
    const data = (await ws.requestSnapshot({
      type: "getStorage",
      tabId: body.tabId,
    })) as StorageSnapshot;
    return c.json(data);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

app.post("/snapshot/dom", async (c) => {
  const body = await c.req.json<{ tabId: number }>();
  try {
    const data = (await ws.requestSnapshot({
      type: "getDOM",
      tabId: body.tabId,
    })) as DOMSnapshot;
    return c.json(data);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

app.post("/snapshot/screenshot", async (c) => {
  const body = await c.req.json<{
    tabId: number;
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
  }>();
  try {
    const data = (await ws.requestSnapshot({
      type: "getScreenshot",
      tabId: body.tabId,
      maxWidth: body.maxWidth,
      maxHeight: body.maxHeight,
      quality: body.quality,
    })) as ScreenshotData;
    return c.json(data);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

app.delete("/events", (c) => {
  store.clear();
  return c.json({ ok: true });
});
