import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Spier",
    description: "Browser runtime inspector — exposes network, console, errors, and storage to external tools",
    permissions: ["storage", "alarms", "cookies", "activeTab", "tabs"],
    host_permissions: ["<all_urls>"],
    web_accessible_resources: [
      {
        resources: ["injected.js"],
        matches: ["<all_urls>"],
      },
    ],
  },
});
