#!/usr/bin/env bun
import { Client } from "./client";
import { bold, dim, cyan, red } from "./format";
import { dispatch, COMMAND_LIST } from "./dispatch";
import { shellCmd } from "./commands/shell";

function printHelp() {
  console.log(`\n${bold("spier")} — CLI for Spier browser inspector\n`);
  console.log(`${bold("USAGE")}`);
  console.log(`  spier <command> [options]\n`);
  console.log(`${bold("GLOBAL OPTIONS")}`);
  console.log(`  ${cyan("-p, --port <port>")}   Server port ${dim("(default: 12333)")}`);
  console.log(`  ${cyan("--host <host>")}       Server host ${dim("(default: localhost)")}`);
  console.log(`  ${cyan("--json")}              Raw JSON output`);
  console.log(`  ${cyan("-h, --help")}          Show help\n`);
  console.log(`${bold("COMMANDS")}\n`);
  const maxLen = Math.max(...COMMAND_LIST.map((c) => c.usage.length));
  for (const c of COMMAND_LIST) {
    console.log(`  ${cyan(c.usage.padEnd(maxLen + 2))} ${dim(c.desc)}`);
  }
  console.log();
}

async function main() {
  const argv = process.argv.slice(2);

  // Extract global options
  let port = 12333;
  let host = "localhost";
  let jsonMode = false;
  const remaining: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "-p" || a === "--port") && argv[i + 1]) {
      port = Number(argv[++i]);
    } else if (a === "--host" && argv[i + 1]) {
      host = argv[++i];
    } else if (a === "--json") {
      jsonMode = true;
    } else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else {
      remaining.push(a);
    }
  }

  if (remaining.length === 0) {
    printHelp();
    process.exit(0);
  }

  const cmd = remaining[0];
  const cmdArgs = remaining.slice(1);
  const client = new Client(host, port);

  try {
    // Handle shell separately (not in dispatch to avoid circular dep)
    if (cmd === "shell") {
      await shellCmd(client, cmdArgs, jsonMode);
      return;
    }

    const found = await dispatch(client, cmd, cmdArgs, jsonMode);
    if (!found) {
      console.error(red(`Unknown command: ${cmd}`));
      console.error(`Run ${dim("spier --help")} to see available commands.`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(red(`Error: ${err.message}`));
    process.exit(1);
  }
}

main();
