import * as readline from "node:readline";
import type { Client } from "../client";
import { bold, dim, cyan, red } from "../format";
import { dispatch, COMMAND_LIST } from "../dispatch";

export async function shellCmd(client: Client, _args: string[], jsonMode: boolean) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: bold("spier> "),
    historySize: 200,
  });

  console.log(cyan("Spier interactive shell") + dim(" — type 'help' for commands, 'exit' to quit"));
  rl.prompt();

  rl.on("line", async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }
    if (trimmed === "exit" || trimmed === "quit") {
      rl.close();
      return;
    }
    if (trimmed === "help") {
      printHelp();
      rl.prompt();
      return;
    }

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];
    const cmdArgs = parts.slice(1);

    try {
      const found = await dispatch(client, cmd, cmdArgs, jsonMode);
      if (!found) {
        console.error(red(`Unknown command: ${cmd}`) + dim(" — type 'help' for available commands"));
      }
    } catch (err: any) {
      console.error(red(`Error: ${err.message}`));
    }
    rl.prompt();
  });

  rl.on("close", () => {
    console.log(dim("\nBye!"));
    process.exit(0);
  });

  // Keep the process alive
  await new Promise(() => {});
}

function printHelp() {
  console.log(bold("\nAvailable commands:\n"));
  const maxLen = Math.max(...COMMAND_LIST.map((c) => c.usage.length));
  for (const c of COMMAND_LIST) {
    console.log(`  ${cyan(c.usage.padEnd(maxLen + 2))} ${dim(c.desc)}`);
  }
  console.log();
}
