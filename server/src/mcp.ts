import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const serverUrl = getArg('server-url', 'http://localhost:12333');

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

// --- Browser control tools ---

mcp.tool(
  'navigate',
  'Navigate a tab to a URL',
  {
    tabId: z.number().describe('Tab ID to navigate'),
    url: z.string().describe('URL to navigate to'),
  },
  async ({ tabId, url }) => {
    const data = await apiPost('/action/navigate', { tabId, url });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'go_back',
  'Navigate a tab back in history',
  {
    tabId: z.number().describe('Tab ID'),
  },
  async ({ tabId }) => {
    const data = await apiPost('/action/go-back', { tabId });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'go_forward',
  'Navigate a tab forward in history',
  {
    tabId: z.number().describe('Tab ID'),
  },
  async ({ tabId }) => {
    const data = await apiPost('/action/go-forward', { tabId });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'reload_tab',
  'Reload a tab',
  {
    tabId: z.number().describe('Tab ID to reload'),
  },
  async ({ tabId }) => {
    const data = await apiPost('/action/reload', { tabId });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'create_tab',
  'Create a new browser tab',
  {
    url: z.string().optional().describe('URL to open (defaults to about:blank)'),
  },
  async ({ url }) => {
    const data = await apiPost('/action/create-tab', { url });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'close_tab',
  'Close a browser tab',
  {
    tabId: z.number().describe('Tab ID to close'),
  },
  async ({ tabId }) => {
    const data = await apiPost('/action/close-tab', { tabId });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'activate_tab',
  'Activate (focus) a browser tab',
  {
    tabId: z.number().describe('Tab ID to activate'),
  },
  async ({ tabId }) => {
    const data = await apiPost('/action/activate-tab', { tabId });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'execute_js',
  'Execute JavaScript in a tab\'s page context',
  {
    tabId: z.number().describe('Tab ID to execute JS in'),
    code: z.string().describe('JavaScript code to execute'),
  },
  async ({ tabId, code }) => {
    const data = await apiPost('/action/execute-js', { tabId, code });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'click_element',
  'Click an element on a page by CSS selector',
  {
    tabId: z.number().describe('Tab ID'),
    selector: z.string().describe('CSS selector of element to click'),
  },
  async ({ tabId, selector }) => {
    const data = await apiPost('/action/click', { tabId, selector });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'fill_input',
  'Fill an input field with a value (works with React/Vue)',
  {
    tabId: z.number().describe('Tab ID'),
    selector: z.string().describe('CSS selector of input element'),
    value: z.string().describe('Value to fill'),
  },
  async ({ tabId, selector, value }) => {
    const data = await apiPost('/action/fill', { tabId, selector, value });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'type_text',
  'Type text character-by-character into an element',
  {
    tabId: z.number().describe('Tab ID'),
    selector: z.string().describe('CSS selector of element to type into'),
    text: z.string().describe('Text to type'),
    delay: z.number().optional().default(50).describe('Delay in ms between keystrokes'),
  },
  async ({ tabId, selector, text, delay }) => {
    const data = await apiPost('/action/type', { tabId, selector, text, delay });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

mcp.tool(
  'wait_for_selector',
  'Wait for an element matching a CSS selector to appear in the DOM',
  {
    tabId: z.number().describe('Tab ID'),
    selector: z.string().describe('CSS selector to wait for'),
    timeout: z.number().optional().default(5000).describe('Timeout in ms'),
  },
  async ({ tabId, selector, timeout }) => {
    const data = await apiPost('/action/wait-for-selector', { tabId, selector, timeout });
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
  }
);

interface A11yNode {
  ref: string;
  role: string;
  name: string;
  value?: string;
  description?: string;
  focused?: boolean;
  disabled?: boolean;
  checked?: boolean | 'mixed';
  expanded?: boolean;
  selected?: boolean;
  level?: number;
  children?: A11yNode[];
}

function formatA11yTree(node: A11yNode, depth = 0): string {
  const indent = '  '.repeat(depth);
  const attrs: string[] = [];
  if (node.focused) attrs.push('[focused]');
  if (node.disabled) attrs.push('[disabled]');
  if (node.checked != null) attrs.push(node.checked === 'mixed' ? '[checked=mixed]' : `[checked]`);
  if (node.expanded != null) attrs.push(`[expanded=${node.expanded}]`);
  if (node.selected) attrs.push('[selected]');
  if (node.value) attrs.push(`value="${node.value}"`);
  if (node.level != null) attrs.push(`level=${node.level}`);

  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  const nameStr = node.name ? ` "${node.name}"` : '';
  let line = `${indent}[@${node.ref}] ${node.role}${nameStr}${attrStr}`;

  const lines = [line];
  if (node.children) {
    for (const child of node.children) {
      lines.push(formatA11yTree(child, depth + 1));
    }
  }
  return lines.join('\n');
}

mcp.tool(
  'get_accessibility_snapshot',
  'Get the accessibility tree for a tab — useful for understanding page structure and finding interactive elements by ref',
  {
    tabId: z.number().describe('Tab ID'),
  },
  async ({ tabId }) => {
    const data = await apiPost('/snapshot/accessibility', { tabId }) as {
      tabId: number; url: string; title: string; tree: A11yNode;
    };
    const header = `Page: ${data.title} (${data.url})\n\n`;
    const tree = formatA11yTree(data.tree);
    return { content: [{ type: 'text', text: header + tree }] };
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
