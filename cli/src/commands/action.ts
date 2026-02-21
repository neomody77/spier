import type { Client } from "../client";
import { green, red, dim, json as jsonOut } from "../format";

function requireTabId(args: string[]): number {
  const id = args[0];
  if (!id) throw new Error("Missing required argument: <tabId>");
  const n = Number(id);
  if (isNaN(n)) throw new Error(`Invalid tabId: ${id}`);
  return n;
}

function printResult(data: any, jsonMode: boolean) {
  if (jsonMode) return jsonOut(data);
  if (data.success) {
    if (data.data !== undefined && data.data !== null) {
      console.log(typeof data.data === "string" ? data.data : JSON.stringify(data.data, null, 2));
    } else {
      console.log(green("OK"));
    }
  } else {
    console.error(red(`Error: ${data.error || "unknown error"}`));
    process.exit(1);
  }
}

export async function navCmd(client: Client, args: string[], jsonMode: boolean) {
  const tabId = requireTabId(args);
  const url = args[1];
  if (!url) throw new Error("Missing required argument: <url>");
  printResult(await client.post("/action/navigate", { tabId, url }), jsonMode);
}

export async function backCmd(client: Client, args: string[], jsonMode: boolean) {
  const tabId = requireTabId(args);
  printResult(await client.post("/action/go-back", { tabId }), jsonMode);
}

export async function forwardCmd(client: Client, args: string[], jsonMode: boolean) {
  const tabId = requireTabId(args);
  printResult(await client.post("/action/go-forward", { tabId }), jsonMode);
}

export async function reloadCmd(client: Client, args: string[], jsonMode: boolean) {
  const tabId = requireTabId(args);
  printResult(await client.post("/action/reload", { tabId }), jsonMode);
}

export async function clickCmd(client: Client, args: string[], jsonMode: boolean) {
  const tabId = requireTabId(args);
  const selector = args[1];
  if (!selector) throw new Error("Missing required argument: <selector>");
  printResult(await client.post("/action/click", { tabId, selector }), jsonMode);
}

export async function fillCmd(client: Client, args: string[], jsonMode: boolean) {
  const tabId = requireTabId(args);
  const selector = args[1];
  const value = args[2];
  if (!selector) throw new Error("Missing required argument: <selector>");
  if (value === undefined) throw new Error("Missing required argument: <value>");
  printResult(await client.post("/action/fill", { tabId, selector, value }), jsonMode);
}

export async function typeCmd(client: Client, args: string[], jsonMode: boolean) {
  const tabId = requireTabId(args);
  const selector = args[1];
  const text = args[2];
  if (!selector) throw new Error("Missing required argument: <selector>");
  if (text === undefined) throw new Error("Missing required argument: <text>");
  printResult(await client.post("/action/type", { tabId, selector, text }), jsonMode);
}

export async function execCmd(client: Client, args: string[], jsonMode: boolean) {
  const tabId = requireTabId(args);
  const code = args.slice(1).join(" ");
  if (!code) throw new Error("Missing required argument: <code>");
  printResult(await client.post("/action/execute-js", { tabId, code }), jsonMode);
}

export async function waitCmd(client: Client, args: string[], jsonMode: boolean) {
  const tabId = requireTabId(args);
  const selector = args[1];
  if (!selector) throw new Error("Missing required argument: <selector>");
  printResult(await client.post("/action/wait-for-selector", { tabId, selector }), jsonMode);
}
