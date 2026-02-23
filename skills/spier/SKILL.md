---
name: spier
description: Browser runtime inspector — controls Chrome tabs, inspects network/console/errors, reads storage/DOM/accessibility, takes screenshots, and executes JS via the Spier extension+server. Use when the user wants to open/navigate/close tabs, inspect page state, view network requests, read console logs, check errors, get DOM or accessibility snapshots, take screenshots, click elements, fill forms, or execute JavaScript in the browser.
user-invocable: true
allowed-tools: Bash(spier:*)
---

# Spier — Browser Runtime Inspector

Spier consists of a Chrome extension that instruments browser tabs and a local server (default `localhost:12333`) that exposes an HTTP API. All commands below use `curl`.

## Setup & Auto-start (MUST run on every skill invocation)

Before doing anything else, run these steps in order:

### 1. Install dependencies (first time only)

```bash
# spier:setup
if [ ! -d "${CLAUDE_PLUGIN_ROOT}/node_modules/hono" ]; then
  cd "${CLAUDE_PLUGIN_ROOT}" && npm install --no-audit --no-fund 2>&1 | tail -1
fi
```

### 2. Build extension (first time only)

```bash
# spier:build-ext
if [ ! -d "${CLAUDE_PLUGIN_ROOT}/extension/dist/chrome-mv3" ]; then
  cd "${CLAUDE_PLUGIN_ROOT}/extension" && npm run build 2>&1 | tail -3
fi
ls "${CLAUDE_PLUGIN_ROOT}/extension/dist/chrome-mv3/manifest.json"
```

### 3. Start server

```bash
# spier:ensure-server
curl -sf http://localhost:12333/ > /dev/null 2>&1 || { cd "${CLAUDE_PLUGIN_ROOT}" && npx tsx server/src/index.ts & sleep 0.5; }
curl -s http://localhost:12333/
```

If the response shows `"extensionConnected":false`, remind the user:
> Extension not connected. Load `${CLAUDE_PLUGIN_ROOT}/extension/dist/chrome-mv3/` in `chrome://extensions` (once), then click the Spier icon to enable it.

Only proceed to actual commands after the server is confirmed up and the extension is connected.

## Quick Reference

| Action | Command |
|--------|---------|
| List tabs | `curl -s localhost:12333/tabs` |
| Create tab | `curl -s -X POST localhost:12333/action/create-tab -H 'Content-Type: application/json' -d '{"url":"https://example.com"}'` |
| Navigate | `curl -s -X POST localhost:12333/action/navigate -H 'Content-Type: application/json' -d '{"tabId":TAB_ID,"url":"https://example.com"}'` |
| Close tab | `curl -s -X POST localhost:12333/action/close-tab -H 'Content-Type: application/json' -d '{"tabId":TAB_ID}'` |
| Activate tab | `curl -s -X POST localhost:12333/action/activate-tab -H 'Content-Type: application/json' -d '{"tabId":TAB_ID}'` |
| Go back | `curl -s -X POST localhost:12333/action/go-back -H 'Content-Type: application/json' -d '{"tabId":TAB_ID}'` |
| Go forward | `curl -s -X POST localhost:12333/action/go-forward -H 'Content-Type: application/json' -d '{"tabId":TAB_ID}'` |
| Reload | `curl -s -X POST localhost:12333/action/reload -H 'Content-Type: application/json' -d '{"tabId":TAB_ID}'` |

## Inspecting Page State

### DOM Snapshot

```bash
curl -s -X POST localhost:12333/snapshot/dom -H 'Content-Type: application/json' -d '{"tabId":TAB_ID}'
# Returns: { tabId, url, title, html }
```

### Storage (localStorage, sessionStorage, cookies)

```bash
curl -s -X POST localhost:12333/snapshot/storage -H 'Content-Type: application/json' -d '{"tabId":TAB_ID}'
# Returns: { tabId, url, localStorage, sessionStorage, cookies }
```

### Screenshot

```bash
curl -s -X POST localhost:12333/snapshot/screenshot -H 'Content-Type: application/json' \
  -d '{"tabId":TAB_ID,"maxWidth":1024,"quality":60}'
# Returns: { tabId, url, dataUrl, width, height }
```

To save as a file, extract the base64 data URL and decode it.

### Accessibility Tree

```bash
curl -s -X POST localhost:12333/snapshot/accessibility -H 'Content-Type: application/json' -d '{"tabId":TAB_ID}'
# Returns: { tabId, url, title, tree: { ref, role, name, children, ... } }
```

## Interacting with Pages

### Click Element

```bash
curl -s -X POST localhost:12333/action/click -H 'Content-Type: application/json' \
  -d '{"tabId":TAB_ID,"selector":"button.submit"}'
```

### Fill Input

```bash
curl -s -X POST localhost:12333/action/fill -H 'Content-Type: application/json' \
  -d '{"tabId":TAB_ID,"selector":"input[name=q]","value":"search text"}'
```

### Type Text (with optional keystroke delay)

```bash
curl -s -X POST localhost:12333/action/type -H 'Content-Type: application/json' \
  -d '{"tabId":TAB_ID,"selector":"input[name=q]","text":"hello","delay":50}'
```

### Execute JavaScript

```bash
curl -s -X POST localhost:12333/action/execute-js -H 'Content-Type: application/json' \
  -d '{"tabId":TAB_ID,"code":"document.title"}'
```

### Wait for Selector

```bash
curl -s -X POST localhost:12333/action/wait-for-selector -H 'Content-Type: application/json' \
  -d '{"tabId":TAB_ID,"selector":".results","timeout":5000}'
```

### Wait for Navigation

```bash
curl -s -X POST localhost:12333/action/wait-for-navigation -H 'Content-Type: application/json' \
  -d '{"tabId":TAB_ID,"timeout":10000}'
```

## Observing Events

### All Events

```bash
curl -s 'localhost:12333/events?limit=50'
curl -s 'localhost:12333/events?type=network&tabId=TAB_ID&limit=20'
```

### Network Requests

```bash
curl -s 'localhost:12333/events/network?limit=20'
curl -s 'localhost:12333/events/network?tabId=TAB_ID&url=api&method=POST'
```

### Console Logs

```bash
curl -s 'localhost:12333/events/console?limit=20'
curl -s 'localhost:12333/events/console?tabId=TAB_ID&level=error'
```

### Errors

```bash
curl -s 'localhost:12333/events/errors?limit=20'
curl -s 'localhost:12333/events/errors?tabId=TAB_ID'
```

### Clear Events

```bash
curl -s -X DELETE localhost:12333/events
```

## Display Conventions

When listing tabs, assign temporary aliases `tab0`, `tab1`, ... (by array order) and display them in a table:

```
| # | Tab ID | Title | URL |
|---|--------|-------|-----|
| tab0 | 980899284 | about:blank | about:blank |
| tab1 | 980899289 | 百度一下 | https://www.baidu.com/ |
```

When the user refers to a tab by alias (e.g. "tab1"), resolve it to the real `tabId` from the most recent tab listing.

## Workflow

1. **List tabs** to find existing tab IDs, or **create a tab**
2. **Inspect** using DOM/storage/screenshot/accessibility snapshots
3. **Interact** by clicking, filling, typing, or executing JS
4. **Observe** network requests, console logs, and errors
5. **Wait** for navigation or selectors when needed after interactions
