const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const WHITE = '\x1b[37m';

function timestamp(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${DIM}${h}:${m}:${s}.${ms}${RESET}`;
}

function fmt(category: string, color: string, message: string): string {
  return `${timestamp()} ${color}[${category}]${RESET} ${message}`;
}

export const log = {
  http(method: string, path: string, status: number, durationMs: number) {
    const statusColor = status >= 400 ? RED : status >= 300 ? YELLOW : GREEN;
    console.log(fmt('http', CYAN, `${WHITE}${method}${RESET} ${path} ${statusColor}${status}${RESET} ${DIM}${durationMs}ms${RESET}`));
  },

  wsConnect(role: string, detail?: string) {
    console.log(fmt('ws', MAGENTA, `${GREEN}+${RESET} ${role}${detail ? ` ${DIM}${detail}${RESET}` : ''}`));
  },

  wsDisconnect(role: string, detail?: string) {
    console.log(fmt('ws', MAGENTA, `${RED}-${RESET} ${role}${detail ? ` ${DIM}${detail}${RESET}` : ''}`));
  },

  requestSent(requestId: string, type: string, tabId?: number) {
    const tab = tabId != null ? ` tab:${tabId}` : '';
    console.log(fmt('req', YELLOW, `${WHITE}>>>${RESET} ${type}${tab} ${DIM}${requestId.slice(0, 8)}${RESET}`));
  },

  actionDetail(params: Record<string, unknown>) {
    const parts = Object.entries(params)
      .filter(([_, v]) => v != null)
      .map(([k, v]) => {
        const s = typeof v === 'string' && v.length > 80 ? v.slice(0, 80) + '…' : String(v);
        return `${k}=${s}`;
      });
    if (parts.length > 0) {
      console.log(fmt('req', YELLOW, `    ${DIM}${parts.join(' ')}${RESET}`));
    }
  },

  requestResolved(requestId: string, type: string, durationMs: number) {
    console.log(fmt('req', YELLOW, `${GREEN}<<<${RESET} ${type} ${DIM}${requestId.slice(0, 8)} ${durationMs}ms${RESET}`));
  },

  requestFailed(requestId: string, type: string, error: string, durationMs: number) {
    console.log(fmt('req', YELLOW, `${RED}<<! ${type}${RESET} ${error} ${DIM}${requestId.slice(0, 8)} ${durationMs}ms${RESET}`));
  },

  eventIngested(eventType: string, tabId: number) {
    console.log(fmt('evt', GREEN, `${eventType} ${DIM}tab:${tabId}${RESET}`));
  },

  system(message: string) {
    console.log(fmt('sys', BLUE, message));
  },

  warn(message: string) {
    console.log(fmt('warn', YELLOW, `${YELLOW}${message}${RESET}`));
  },

  error(message: string, err?: unknown) {
    console.error(fmt('err', RED, `${RED}${message}${RESET}`));
    if (err) console.error(err);
  },
};
