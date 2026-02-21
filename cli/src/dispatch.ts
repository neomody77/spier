import type { Client } from "./client";
import { red, dim } from "./format";

// Command handlers
import { statusCmd } from "./commands/status";
import { tabsCmd } from "./commands/tabs";
import { logsCmd, networkCmd, errorsCmd, eventsCmd, clearCmd } from "./commands/events";
import { domCmd, storageCmd, screenshotCmd, a11yCmd } from "./commands/snapshot";
import { navCmd, backCmd, forwardCmd, reloadCmd, clickCmd, fillCmd, typeCmd, execCmd, waitCmd } from "./commands/action";
import { openCmd, closeCmd, activateCmd } from "./commands/tab-mgmt";

type CmdHandler = (client: Client, args: string[], jsonMode: boolean) => Promise<void>;

const COMMANDS: Record<string, CmdHandler> = {
  status: statusCmd,
  tabs: tabsCmd,
  logs: logsCmd,
  network: networkCmd,
  errors: errorsCmd,
  events: eventsCmd,
  clear: clearCmd,
  dom: domCmd,
  storage: storageCmd,
  screenshot: screenshotCmd,
  a11y: a11yCmd,
  nav: navCmd,
  back: backCmd,
  forward: forwardCmd,
  reload: reloadCmd,
  click: clickCmd,
  fill: fillCmd,
  type: typeCmd,
  exec: execCmd,
  wait: waitCmd,
  open: openCmd,
  close: closeCmd,
  activate: activateCmd,
};

export const COMMAND_LIST = [
  { usage: "status", desc: "Server status" },
  { usage: "tabs", desc: "List open tabs" },
  { usage: "logs [-t tabId] [-l level] [-n limit]", desc: "Console logs" },
  { usage: "network [-t tabId] [-u url] [-m method] [-n limit]", desc: "Network requests" },
  { usage: "errors [-t tabId] [-n limit]", desc: "JS errors" },
  { usage: "events [-t tabId] [--type TYPE] [-n limit]", desc: "All events" },
  { usage: "clear", desc: "Clear all events" },
  { usage: "dom <tabId>", desc: "DOM snapshot" },
  { usage: "storage <tabId>", desc: "Storage & cookies" },
  { usage: "screenshot <tabId> [-o file]", desc: "Save screenshot" },
  { usage: "a11y <tabId>", desc: "Accessibility tree" },
  { usage: "nav <tabId> <url>", desc: "Navigate to URL" },
  { usage: "back <tabId>", desc: "Go back" },
  { usage: "forward <tabId>", desc: "Go forward" },
  { usage: "reload <tabId>", desc: "Reload page" },
  { usage: "click <tabId> <selector>", desc: "Click element" },
  { usage: "fill <tabId> <selector> <value>", desc: "Set input value" },
  { usage: "type <tabId> <selector> <text>", desc: "Type text char by char" },
  { usage: "exec <tabId> <code>", desc: "Execute JavaScript" },
  { usage: "wait <tabId> <selector>", desc: "Wait for element" },
  { usage: "open [url]", desc: "Open new tab" },
  { usage: "close <tabId>", desc: "Close tab" },
  { usage: "activate <tabId>", desc: "Activate tab" },
  { usage: "shell", desc: "Interactive REPL" },
];

export async function dispatch(client: Client, cmd: string, args: string[], jsonMode: boolean): Promise<boolean> {
  const handler = COMMANDS[cmd];
  if (!handler) return false;
  await handler(client, args, jsonMode);
  return true;
}
