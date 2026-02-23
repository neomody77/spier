import { defineConfig } from "wxt";

export default defineConfig({
  outDir: "dist",
  manifest: {
    name: "Spier",
    description: "Browser runtime inspector — exposes network, console, errors, and storage to external tools",
    permissions: ["storage", "alarms", "cookies", "activeTab", "tabs", "debugger", "tabGroups"],
    host_permissions: ["<all_urls>"],
    web_accessible_resources: [
      {
        resources: ["injected.js"],
        matches: ["<all_urls>"],
      },
    ],
  },
});
