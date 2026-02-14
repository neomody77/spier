// === Event Types ===

export type SpierEventType = 'network' | 'console' | 'error' | 'storage' | 'dom' | 'screenshot';

export interface NetworkEvent {
  type: 'network';
  id: string;
  timestamp: number;
  tabId: number;
  url: string;
  method: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  duration?: number;
  error?: string;
}

export interface ConsoleEvent {
  type: 'console';
  timestamp: number;
  tabId: number;
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: string[];
  stack?: string;
}

export interface ErrorEvent {
  type: 'error';
  timestamp: number;
  tabId: number;
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  isUnhandledRejection: boolean;
}

export type SpierEvent = NetworkEvent | ConsoleEvent | ErrorEvent;

// === On-demand Snapshots ===

export interface StorageSnapshot {
  tabId: number;
  url: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: Array<{ name: string; value: string; domain: string }>;
}

export interface DOMSnapshot {
  tabId: number;
  url: string;
  title: string;
  html: string;
}

export interface ScreenshotData {
  tabId: number;
  url: string;
  dataUrl: string;
  width: number;
  height: number;
}

// === Tab Info ===

export interface TabInfo {
  tabId: number;
  url: string;
  title: string;
  favIconUrl?: string;
}

// === Extension → Server WebSocket Messages ===

export type ExtensionMessage =
  | { type: 'event'; data: SpierEvent }
  | { type: 'snapshot'; requestId: string; data: StorageSnapshot | DOMSnapshot | ScreenshotData }
  | { type: 'tabs'; requestId: string; tabs: TabInfo[] };

// === Server → Extension Requests ===

export type ServerRequest =
  | { type: 'getStorage'; requestId: string; tabId: number }
  | { type: 'getDOM'; requestId: string; tabId: number }
  | { type: 'getScreenshot'; requestId: string; tabId: number; maxWidth?: number; maxHeight?: number; quality?: number }
  | { type: 'getTabs'; requestId: string };
