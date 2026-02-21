import type { Client } from "../client";
import { bold, green, red, dim, json as jsonOut } from "../format";

export async function statusCmd(client: Client, _args: string[], jsonMode: boolean) {
  const data = await client.get("/");
  if (jsonMode) return jsonOut(data);

  console.log(bold("Server Status"));
  console.log(`  Status:     ${green(data.status)}`);
  console.log(`  Extension:  ${data.extensionConnected ? green("connected") : red("disconnected")}`);
  console.log(`  Subscribers: ${dim(String(data.subscriberCount))}`);
}
