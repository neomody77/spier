// Internal message types between content script ↔ background

export interface ContentToBackgroundEvent {
  source: '__spier__';
  action: 'event';
  data: {
    type: 'network' | 'console' | 'error';
    [key: string]: unknown;
  };
}

export interface BackgroundToContentRequest {
  source: '__spier__';
  action: 'getStorage' | 'getDOM' | 'click' | 'fill' | 'type' | 'waitForSelector' | 'executeJs';
  requestId: string;
  selector?: string;
  value?: string;
  text?: string;
  delay?: number;
  code?: string;
  timeout?: number;
}

export interface ContentToBackgroundSnapshot {
  source: '__spier__';
  action: 'snapshot';
  requestId: string;
  data: unknown;
}

export type ContentMessage =
  | ContentToBackgroundEvent
  | ContentToBackgroundSnapshot;

// MAIN world → ISOLATED world postMessage
export interface InjectedPostMessage {
  source: '__spier__';
  payload: {
    type: 'network' | 'console' | 'error';
    [key: string]: unknown;
  };
}

// Background state communicated to popup
export interface PopupState {
  enabled: boolean;
  connected: boolean;
  reconnecting: boolean;
  serverAddress: string;
  tabCount: number;
}
