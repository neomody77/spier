import type { Client } from "../client";
import { bold, dim, cyan, json as jsonOut, formatTimestamp } from "../format";
import { writeFile } from "node:fs/promises";

function requireTabId(args: string[]): number {
  const id = args[0];
  if (!id) throw new Error("Missing required argument: <tabId>");
  const n = Number(id);
  if (isNaN(n)) throw new Error(`Invalid tabId: ${id}`);
  return n;
}

function parseOpts(args: string[]): Record<string, string> {
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === "-o" || args[i] === "--output") && args[i + 1]) opts.output = args[++i];
  }
  return opts;
}

export async function domCmd(client: Client, args: string[], jsonMode: boolean) {
  const tabId = requireTabId(args);
  const data = await client.post("/snapshot/dom", { tabId });
  if (jsonMode) return jsonOut(data);
  console.log(dim(`# ${data.title} — ${data.url}`));
  console.log(data.html);
}

export async function storageCmd(client: Client, args: string[], jsonMode: boolean) {
  const tabId = requireTabId(args);
  const data = await client.post("/snapshot/storage", { tabId });
  if (jsonMode) return jsonOut(data);

  console.log(bold("localStorage") + dim(` (${Object.keys(data.localStorage).length} items)`));
  for (const [k, v] of Object.entries(data.localStorage)) {
    console.log(`  ${cyan(k)}: ${v}`);
  }

  console.log();
  console.log(bold("sessionStorage") + dim(` (${Object.keys(data.sessionStorage).length} items)`));
  for (const [k, v] of Object.entries(data.sessionStorage)) {
    console.log(`  ${cyan(k)}: ${v}`);
  }

  console.log();
  console.log(bold("cookies") + dim(` (${data.cookies.length} items)`));
  for (const c of data.cookies) {
    console.log(`  ${cyan(c.name)}=${c.value}` + dim(` (${c.domain})`));
  }
}

export async function screenshotCmd(client: Client, args: string[], jsonMode: boolean) {
  const tabId = requireTabId(args);
  const opts = parseOpts(args.slice(1));
  const data = await client.post("/snapshot/screenshot", { tabId });
  if (jsonMode) return jsonOut(data);

  const filename = opts.output || `screenshot-${tabId}.jpg`;
  // dataUrl format: data:image/jpeg;base64,<base64data>
  const base64 = data.dataUrl.split(",")[1];
  const buf = Buffer.from(base64, "base64");
  await writeFile(filename, buf);
  console.log(`Screenshot saved: ${bold(filename)} (${data.width}x${data.height})`);
}

export async function a11yCmd(client: Client, args: string[], jsonMode: boolean) {
  const tabId = requireTabId(args);
  const data = await client.post("/snapshot/accessibility", { tabId });
  if (jsonMode) return jsonOut(data);

  console.log(dim(`# ${data.title} — ${data.url}`));
  printNode(data.tree, 0);
}

function printNode(node: any, depth: number) {
  const indent = "  ".repeat(depth);
  const role = bold(node.role || "");
  const name = node.name ? ` ${cyan(JSON.stringify(node.name))}` : "";
  const value = node.value ? dim(` = ${node.value}`) : "";
  console.log(`${indent}${role}${name}${value}`);
  if (node.children) {
    for (const child of node.children) {
      printNode(child, depth + 1);
    }
  }
}
