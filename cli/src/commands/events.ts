import type { Client } from "../client";
import { table, json as jsonOut, formatTimestamp, truncate, dim, red, yellow, cyan, magenta, green } from "../format";

function parseOpts(args: string[]): Record<string, string> {
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if ((a === "-t" || a === "--tab") && args[i + 1]) opts.tabId = args[++i];
    else if ((a === "-n" || a === "--limit") && args[i + 1]) opts.limit = args[++i];
    else if ((a === "-l" || a === "--level") && args[i + 1]) opts.level = args[++i];
    else if ((a === "-u" || a === "--url") && args[i + 1]) opts.url = args[++i];
    else if ((a === "-m" || a === "--method") && args[i + 1]) opts.method = args[++i];
    else if (a === "--type" && args[i + 1]) opts.type = args[++i];
  }
  return opts;
}

const levelColor: Record<string, (s: string) => string> = {
  error: red,
  warn: yellow,
  info: cyan,
  debug: magenta,
  log: (s: string) => s,
};

export async function logsCmd(client: Client, args: string[], jsonMode: boolean) {
  const opts = parseOpts(args);
  const data = await client.get("/events/console", {
    tabId: opts.tabId,
    level: opts.level,
    limit: opts.limit,
  });
  if (jsonMode) return jsonOut(data);

  for (const e of data) {
    const ts = dim(formatTimestamp(e.timestamp));
    const lvl = (levelColor[e.level] || ((s: string) => s))(e.level.padEnd(5));
    const tab = dim(`[${e.tabId}]`);
    const msg = e.args?.join(" ") ?? "";
    console.log(`${ts} ${lvl} ${tab} ${msg}`);
  }
  if (data.length === 0) console.log(dim("  (no console logs)"));
}

export async function networkCmd(client: Client, args: string[], jsonMode: boolean) {
  const opts = parseOpts(args);
  const data = await client.get("/events/network", {
    tabId: opts.tabId,
    url: opts.url,
    method: opts.method,
    limit: opts.limit,
  });
  if (jsonMode) return jsonOut(data);

  table(
    data.map((e: any) => {
      const status = e.status ? String(e.status) : "…";
      const statusStr = e.status >= 400 ? red(status) : e.status >= 300 ? yellow(status) : green(status);
      return {
        time: formatTimestamp(e.timestamp),
        method: e.method || "GET",
        status: statusStr,
        duration: e.duration ? `${e.duration}ms` : "",
        url: truncate(e.url || "", 70),
      };
    }),
    [
      { key: "time", label: "TIME" },
      { key: "method", label: "METHOD" },
      { key: "status", label: "STATUS" },
      { key: "duration", label: "DUR" },
      { key: "url", label: "URL" },
    ]
  );
}

export async function errorsCmd(client: Client, args: string[], jsonMode: boolean) {
  const opts = parseOpts(args);
  const data = await client.get("/events/errors", {
    tabId: opts.tabId,
    limit: opts.limit,
  });
  if (jsonMode) return jsonOut(data);

  for (const e of data) {
    const ts = dim(formatTimestamp(e.timestamp));
    const tab = dim(`[${e.tabId}]`);
    const prefix = e.isUnhandledRejection ? red("REJECT") : red("ERROR ");
    const loc = e.filename ? dim(` ${e.filename}:${e.lineno}:${e.colno}`) : "";
    console.log(`${ts} ${prefix} ${tab} ${e.message}${loc}`);
  }
  if (data.length === 0) console.log(dim("  (no errors)"));
}

export async function eventsCmd(client: Client, args: string[], jsonMode: boolean) {
  const opts = parseOpts(args);
  const data = await client.get("/events", {
    tabId: opts.tabId,
    type: opts.type,
    limit: opts.limit,
  });
  if (jsonMode) return jsonOut(data);

  for (const e of data) {
    const ts = dim(formatTimestamp(e.timestamp));
    const tab = dim(`[${e.tabId}]`);
    const type = cyan(e.type.padEnd(8));
    let summary = "";
    if (e.type === "console") summary = e.args?.join(" ") ?? "";
    else if (e.type === "network") summary = `${e.method} ${e.url} ${e.status ?? ""}`;
    else if (e.type === "error") summary = e.message;
    console.log(`${ts} ${type} ${tab} ${truncate(summary, 80)}`);
  }
  if (data.length === 0) console.log(dim("  (no events)"));
}

export async function clearCmd(client: Client, _args: string[], jsonMode: boolean) {
  const data = await client.del("/events");
  if (jsonMode) return jsonOut(data);
  console.log(green("Events cleared."));
}
