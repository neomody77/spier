import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const serverUrl = getArg('server-url', 'http://localhost:9222');

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${serverUrl}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${serverUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiDelete(path: string): Promise<unknown> {
  const res = await fetch(`${serverUrl}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

const mcp = new McpServer({
  name: 'spier',
  version: '1.0.0',
});

mcp.tool(
  'get_console_logs',
  'Get captured console log events from the browser',
  {
    tabId: z.number().optional().describe('Filter by tab ID'),
    level: z.enum(['log', 'warn', 'error', 'info', 'debug']).optional().describe('Filter by log level'),
    limit: z.number().optional().describe('Max number of events to return'),
  },
  async ({ tabId, level, limit }) => {
    const params = new URLSearchParams();
    if (tabId != null) params.set('tabId', String(tabId));
    if (level) params.set('level', level);
    if (limit != null) params.set('limit', String(limit));
    const qs = params.toString();
    const data = await apiGet(`/events/console${qs ? `?${qs}` : ''}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'get_network_requests',
  'Get captured network request events from the browser',
  {
    tabId: z.number().optional().describe('Filter by tab ID'),
    url: z.string().optional().describe('Filter by URL substring'),
    method: z.string().optional().describe('Filter by HTTP method'),
    limit: z.number().optional().describe('Max number of events to return'),
  },
  async ({ tabId, url, method, limit }) => {
    const params = new URLSearchParams();
    if (tabId != null) params.set('tabId', String(tabId));
    if (url) params.set('url', url);
    if (method) params.set('method', method);
    if (limit != null) params.set('limit', String(limit));
    const qs = params.toString();
    const data = await apiGet(`/events/network${qs ? `?${qs}` : ''}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'get_errors',
  'Get captured JavaScript error events from the browser',
  {
    tabId: z.number().optional().describe('Filter by tab ID'),
    limit: z.number().optional().describe('Max number of events to return'),
  },
  async ({ tabId, limit }) => {
    const params = new URLSearchParams();
    if (tabId != null) params.set('tabId', String(tabId));
    if (limit != null) params.set('limit', String(limit));
    const qs = params.toString();
    const data = await apiGet(`/events/errors${qs ? `?${qs}` : ''}`);
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'get_storage',
  'Get localStorage, sessionStorage, and cookies for a tab',
  {
    tabId: z.number().describe('Tab ID to get storage from'),
  },
  async ({ tabId }) => {
    const data = await apiPost('/snapshot/storage', { tabId });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'get_dom',
  'Get the full DOM HTML snapshot for a tab',
  {
    tabId: z.number().describe('Tab ID to get DOM from'),
  },
  async ({ tabId }) => {
    const data = await apiPost('/snapshot/dom', { tabId });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'get_screenshot',
  'Capture a screenshot of a tab',
  {
    tabId: z.number().describe('Tab ID to screenshot'),
    maxWidth: z.number().optional().describe('Max width in pixels'),
    maxHeight: z.number().optional().describe('Max height in pixels'),
    quality: z.number().min(0).max(100).optional().describe('JPEG quality (0-100)'),
  },
  async ({ tabId, maxWidth, maxHeight, quality }) => {
    const data = await apiPost('/snapshot/screenshot', { tabId, maxWidth, maxHeight, quality }) as { dataUrl?: string };
    if (data.dataUrl) {
      const base64 = data.dataUrl.replace(/^data:image\/\w+;base64,/, '');
      return { content: [{ type: 'image', data: base64, mimeType: 'image/jpeg' }] };
    }
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'get_tabs',
  'List all open browser tabs',
  {},
  async () => {
    const data = await apiGet('/tabs');
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'clear_events',
  'Clear all stored events',
  {},
  async () => {
    await apiDelete('/events');
    return { content: [{ type: 'text', text: 'Events cleared' }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  console.error(`Spier MCP server running (target: ${serverUrl})`);
}

main().catch((e) => {
  console.error('Failed to start MCP server:', e);
  process.exit(1);
});
