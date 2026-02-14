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
import { log } from "./logger.js";

export const app = new Hono();

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  log.http(c.req.method, c.req.path, c.res.status, Date.now() - start);
});

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

// --- Action routes ---

app.post("/action/navigate", async (c) => {
  const { tabId, url } = await c.req.json<{ tabId: number; url: string }>();
  try {
    const data = await ws.requestSnapshot({ type: "navigate", tabId, url });
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

app.post("/action/go-back", async (c) => {
  const { tabId } = await c.req.json<{ tabId: number }>();
  try {
    const data = await ws.requestSnapshot({ type: "goBack", tabId });
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

app.post("/action/go-forward", async (c) => {
  const { tabId } = await c.req.json<{ tabId: number }>();
  try {
    const data = await ws.requestSnapshot({ type: "goForward", tabId });
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

app.post("/action/reload", async (c) => {
  const { tabId } = await c.req.json<{ tabId: number }>();
  try {
    const data = await ws.requestSnapshot({ type: "reload", tabId });
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

app.post("/action/create-tab", async (c) => {
  const { url } = await c.req.json<{ url?: string }>();
  try {
    const data = await ws.requestSnapshot({ type: "createTab", url });
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

app.post("/action/close-tab", async (c) => {
  const { tabId } = await c.req.json<{ tabId: number }>();
  try {
    const data = await ws.requestSnapshot({ type: "closeTab", tabId });
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

app.post("/action/activate-tab", async (c) => {
  const { tabId } = await c.req.json<{ tabId: number }>();
  try {
    const data = await ws.requestSnapshot({ type: "activateTab", tabId });
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

app.post("/action/execute-js", async (c) => {
  const { tabId, code } = await c.req.json<{ tabId: number; code: string }>();
  try {
    const data = await ws.requestSnapshot({ type: "executeJs", tabId, code });
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

app.post("/action/click", async (c) => {
  const { tabId, selector } = await c.req.json<{ tabId: number; selector: string }>();
  try {
    const data = await ws.requestSnapshot({ type: "click", tabId, selector });
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

app.post("/action/fill", async (c) => {
  const { tabId, selector, value } = await c.req.json<{ tabId: number; selector: string; value: string }>();
  try {
    const data = await ws.requestSnapshot({ type: "fill", tabId, selector, value });
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

app.post("/action/type", async (c) => {
  const { tabId, selector, text, delay } = await c.req.json<{ tabId: number; selector: string; text: string; delay?: number }>();
  try {
    const data = await ws.requestSnapshot({ type: "type", tabId, selector, text, delay });
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

app.post("/action/wait-for-selector", async (c) => {
  const { tabId, selector, timeout } = await c.req.json<{ tabId: number; selector: string; timeout?: number }>();
  try {
    const data = await ws.requestSnapshot({ type: "waitForSelector", tabId, selector, timeout });
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

app.post("/action/wait-for-navigation", async (c) => {
  const { tabId, timeout } = await c.req.json<{ tabId: number; timeout?: number }>();
  try {
    const data = await ws.requestSnapshot({ type: "waitForNavigation", tabId, timeout }, timeout ? timeout + 2000 : 12000);
    return c.json({ success: true, data });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 502);
  }
});

app.post("/snapshot/accessibility", async (c) => {
  const { tabId } = await c.req.json<{ tabId: number }>();
  try {
    const data = await ws.requestSnapshot({ type: "getAccessibilitySnapshot", tabId });
    return c.json(data);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});
