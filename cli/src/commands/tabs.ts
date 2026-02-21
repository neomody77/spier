import type { Client } from "../client";
import { table, json as jsonOut, truncate } from "../format";

export async function tabsCmd(client: Client, _args: string[], jsonMode: boolean) {
  const tabs = await client.get("/tabs");
  if (jsonMode) return jsonOut(tabs);

  table(
    tabs.map((t: any) => ({
      tabId: String(t.tabId),
      title: truncate(t.title || "", 50),
      url: truncate(t.url || "", 70),
    })),
    [
      { key: "tabId", label: "TAB" },
      { key: "title", label: "TITLE" },
      { key: "url", label: "URL" },
    ]
  );
}
