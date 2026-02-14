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

// === Accessibility ===

export interface AccessibilityNode {
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
  children?: AccessibilityNode[];
}

export interface AccessibilitySnapshot {
  tabId: number;
  url: string;
  title: string;
  tree: AccessibilityNode;
}

// === Extension → Server WebSocket Messages ===

export type ExtensionMessage =
  | { type: 'event'; data: SpierEvent }
  | { type: 'snapshot'; requestId: string; data: StorageSnapshot | DOMSnapshot | ScreenshotData }
  | { type: 'tabs'; requestId: string; tabs: TabInfo[] }
  | { type: 'result'; requestId: string; success: boolean; data?: unknown; error?: string };

// === Server → Extension Requests ===

export type ServerRequest =
  // Existing snapshots
  | { type: 'getStorage'; requestId: string; tabId: number }
  | { type: 'getDOM'; requestId: string; tabId: number }
  | { type: 'getScreenshot'; requestId: string; tabId: number; maxWidth?: number; maxHeight?: number; quality?: number }
  | { type: 'getTabs'; requestId: string }
  // Navigation
  | { type: 'navigate'; requestId: string; tabId: number; url: string }
  | { type: 'goBack'; requestId: string; tabId: number }
  | { type: 'goForward'; requestId: string; tabId: number }
  | { type: 'reload'; requestId: string; tabId: number }
  // Tab management
  | { type: 'createTab'; requestId: string; url?: string }
  | { type: 'closeTab'; requestId: string; tabId: number }
  | { type: 'activateTab'; requestId: string; tabId: number }
  // JS execution
  | { type: 'executeJs'; requestId: string; tabId: number; code: string }
  // Element interaction
  | { type: 'click'; requestId: string; tabId: number; selector: string }
  | { type: 'fill'; requestId: string; tabId: number; selector: string; value: string }
  | { type: 'type'; requestId: string; tabId: number; selector: string; text: string; delay?: number }
  // Waiting
  | { type: 'waitForSelector'; requestId: string; tabId: number; selector: string; timeout?: number }
  | { type: 'waitForNavigation'; requestId: string; tabId: number; timeout?: number }
  // Accessibility
  | { type: 'getAccessibilitySnapshot'; requestId: string; tabId: number };
