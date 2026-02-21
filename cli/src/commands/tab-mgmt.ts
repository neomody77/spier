import type { Client } from "../client";
import { green, json as jsonOut } from "../format";

export async function openCmd(client: Client, args: string[], jsonMode: boolean) {
  const url = args[0]; // optional
  const data = await client.post("/action/create-tab", url ? { url } : {});
  if (jsonMode) return jsonOut(data);
  if (data.success) {
    console.log(green("Tab created."));
  } else {
    console.error(`Error: ${data.error || "unknown"}`);
    process.exit(1);
  }
}

export async function closeCmd(client: Client, args: string[], jsonMode: boolean) {
  const id = args[0];
  if (!id) throw new Error("Missing required argument: <tabId>");
  const tabId = Number(id);
  if (isNaN(tabId)) throw new Error(`Invalid tabId: ${id}`);
  const data = await client.post("/action/close-tab", { tabId });
  if (jsonMode) return jsonOut(data);
  if (data.success) {
    console.log(green("Tab closed."));
  } else {
    console.error(`Error: ${data.error || "unknown"}`);
    process.exit(1);
  }
}

export async function activateCmd(client: Client, args: string[], jsonMode: boolean) {
  const id = args[0];
  if (!id) throw new Error("Missing required argument: <tabId>");
  const tabId = Number(id);
  if (isNaN(tabId)) throw new Error(`Invalid tabId: ${id}`);
  const data = await client.post("/action/activate-tab", { tabId });
  if (jsonMode) return jsonOut(data);
  if (data.success) {
    console.log(green("Tab activated."));
  } else {
    console.error(`Error: ${data.error || "unknown"}`);
    process.exit(1);
  }
}
