# Spier

Browser runtime inspector. A Chrome extension captures network requests, console logs, and JS errors, streams them to a local server, and exposes everything through an MCP server and REST API — so AI agents (or any tool) can observe and control the browser.

## Architecture

```
Chrome Extension  ──WebSocket──▶  Server (Bun)  ◀──  MCP / REST clients
```

- **Extension** — injects into pages, intercepts network/console/errors, forwards events over WebSocket. Also handles on-demand requests: DOM snapshots, storage reads, screenshots, JS execution, element interaction, accessibility trees.
- **Server** — Bun HTTP + WebSocket server. Stores events in memory, relays requests to the extension, exposes a REST API.
- **MCP server** — stdio-based Model Context Protocol server that wraps the REST API, so Claude (or any MCP client) can call tools like `get_network_requests`, `get_screenshot`, `click_element`, `execute_js`, etc.

## Install as Claude Code Plugin

```
/plugin marketplace add neomody77/spier
/plugin install spier@neomody77/spier
```

Then load the Chrome extension from `~/.claude/skills/spier/extension/` in `chrome://extensions`.

## Manual Install

```bash
git clone https://github.com/neomody77/spier.git /tmp/spier
cd /tmp/spier && bun install && bash install.sh
```

## Development

```bash
bun install
bun run dev:server        # starts on :12333, watches for changes
bun run dev:ext           # dev mode with hot reload (via wxt)
```

Load the unpacked extension from `extension/.output/chrome-mv3-dev` in `chrome://extensions`.

### MCP

Add to your MCP client config:

```json
{
  "mcpServers": {
    "spier": {
      "command": "bun",
      "args": ["run", "mcp"],
      "cwd": "/path/to/spier"
    }
  }
}
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `get_tabs` | List open browser tabs |
| `get_network_requests` | Captured network events (filter by tab, URL, method) |
| `get_console_logs` | Captured console events (filter by tab, level) |
| `get_errors` | Captured JS errors |
| `get_dom` | Full DOM HTML snapshot |
| `get_storage` | localStorage, sessionStorage, cookies |
| `get_screenshot` | Tab screenshot |
| `get_accessibility_snapshot` | Accessibility tree |
| `navigate` | Navigate a tab to a URL |
| `go_back` / `go_forward` | History navigation |
| `reload_tab` | Reload a tab |
| `create_tab` / `close_tab` / `activate_tab` | Tab management |
| `execute_js` | Run JavaScript in page context |
| `click_element` | Click by CSS selector |
| `fill_input` | Set input value (React/Vue compatible) |
| `type_text` | Type character-by-character |
| `wait_for_selector` | Wait for element to appear |
| `clear_events` | Clear stored events |

## REST API

The server runs on `http://localhost:12333` by default.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Status (extension connected, subscriber count) |
| GET | `/tabs` | List tabs |
| GET | `/events` | All events (query: `type`, `tabId`, `limit`) |
| GET | `/events/network` | Network events (query: `tabId`, `url`, `method`, `limit`) |
| GET | `/events/console` | Console events (query: `tabId`, `level`, `limit`) |
| GET | `/events/errors` | Error events (query: `tabId`, `limit`) |
| DELETE | `/events` | Clear events |
| POST | `/snapshot/storage` | Get storage snapshot |
| POST | `/snapshot/dom` | Get DOM snapshot |
| POST | `/snapshot/screenshot` | Capture screenshot |
| POST | `/snapshot/accessibility` | Get accessibility tree |
| POST | `/action/navigate` | Navigate tab |
| POST | `/action/go-back` | Go back |
| POST | `/action/go-forward` | Go forward |
| POST | `/action/reload` | Reload tab |
| POST | `/action/create-tab` | Create tab |
| POST | `/action/close-tab` | Close tab |
| POST | `/action/activate-tab` | Activate tab |
| POST | `/action/execute-js` | Execute JS |
| POST | `/action/click` | Click element |
| POST | `/action/fill` | Fill input |
| POST | `/action/type` | Type text |
| POST | `/action/wait-for-selector` | Wait for selector |
| POST | `/action/wait-for-navigation` | Wait for navigation |

## WebSocket

Connect to `ws://localhost:12333/subscribe` to receive events in real-time. Optional query params: `types` (comma-separated event types), `tabId`.
