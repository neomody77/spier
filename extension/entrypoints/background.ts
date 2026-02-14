import type {
  ServerRequest,
  ExtensionMessage,
  TabInfo,
  StorageSnapshot,
  DOMSnapshot,
  ScreenshotData,
} from '../../shared/types';
import type { PopupState } from '../utils/types';

export default defineBackground(() => {
  // --- State ---
  let ws: WebSocket | null = null;
  let connectionState: 'connected' | 'disconnected' | 'reconnecting' =
    'disconnected';
  let enabled = false;
  let serverAddress = 'localhost:9222';

  const RECONNECT_DELAY = 3000;

  // --- ConnectionManager ---
  function connect() {
    if (
      !enabled ||
      ws?.readyState === WebSocket.OPEN ||
      ws?.readyState === WebSocket.CONNECTING
    )
      return;

    connectionState = 'reconnecting';
    updateBadge();

    try {
      ws = new WebSocket(`ws://${serverAddress}/extension`);

      ws.onopen = () => {
        connectionState = 'connected';
        updateBadge();
      };

      ws.onclose = () => {
        ws = null;
        if (enabled) {
          connectionState = 'reconnecting';
          updateBadge();
          setTimeout(connect, RECONNECT_DELAY);
        } else {
          connectionState = 'disconnected';
          updateBadge();
        }
      };

      ws.onerror = () => {
        ws?.close();
      };

      ws.onmessage = (event) => {
        try {
          handleServerMessage(JSON.parse(event.data));
        } catch {
          // Ignore malformed messages
        }
      };
    } catch {
      connectionState = 'reconnecting';
      updateBadge();
      setTimeout(connect, RECONNECT_DELAY);
    }
  }

  function send(msg: ExtensionMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  // --- Handle server requests ---
  async function handleServerMessage(msg: ServerRequest) {
    switch (msg.type) {
      case 'getTabs': {
        const tabs = await chrome.tabs.query({});
        const tabInfos: TabInfo[] = tabs
          .filter((t) => t.id != null)
          .map((t) => ({
            tabId: t.id!,
            url: t.url || '',
            title: t.title || '',
            favIconUrl: t.favIconUrl,
          }));
        send({ type: 'tabs', requestId: msg.requestId, tabs: tabInfos });
        break;
      }

      case 'getStorage': {
        try {
          const storageData = await chrome.tabs.sendMessage(msg.tabId, {
            source: '__spier__',
            action: 'getStorage',
            requestId: msg.requestId,
          });

          const tab = await chrome.tabs.get(msg.tabId);
          let cookies: StorageSnapshot['cookies'] = [];
          if (tab.url) {
            try {
              const rawCookies = await chrome.cookies.getAll({ url: tab.url });
              cookies = rawCookies.map((c) => ({
                name: c.name,
                value: c.value,
                domain: c.domain,
              }));
            } catch {
              // Cookie access may fail
            }
          }

          const snapshot: StorageSnapshot = {
            tabId: msg.tabId,
            url: storageData.url || tab.url || '',
            localStorage: storageData.localStorage || {},
            sessionStorage: storageData.sessionStorage || {},
            cookies,
          };
          send({ type: 'snapshot', requestId: msg.requestId, data: snapshot });
        } catch {
          send({
            type: 'snapshot',
            requestId: msg.requestId,
            data: {
              tabId: msg.tabId,
              url: '',
              localStorage: {},
              sessionStorage: {},
              cookies: [],
            } as StorageSnapshot,
          });
        }
        break;
      }

      case 'getDOM': {
        try {
          const domData = await chrome.tabs.sendMessage(msg.tabId, {
            source: '__spier__',
            action: 'getDOM',
            requestId: msg.requestId,
          });

          const snapshot: DOMSnapshot = {
            tabId: msg.tabId,
            url: domData.url || '',
            title: domData.title || '',
            html: domData.html || '',
          };
          send({ type: 'snapshot', requestId: msg.requestId, data: snapshot });
        } catch {
          send({
            type: 'snapshot',
            requestId: msg.requestId,
            data: {
              tabId: msg.tabId,
              url: '',
              title: '',
              html: '',
            } as DOMSnapshot,
          });
        }
        break;
      }

      case 'getScreenshot': {
        try {
          const tab = await chrome.tabs.get(msg.tabId);

          await chrome.windows.update(tab.windowId, { focused: true });
          await chrome.tabs.update(msg.tabId, { active: true });
          await new Promise((r) => setTimeout(r, 150));

          const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
            format: 'jpeg',
            quality: msg.quality || 60,
          });

          // Decode to get dimensions and optionally resize
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          let bitmap = await createImageBitmap(blob);
          let { width, height } = bitmap;

          const maxW = msg.maxWidth;
          const maxH = msg.maxHeight;

          if (maxW || maxH) {
            let targetW = width;
            let targetH = height;

            if (maxW && width > maxW) {
              targetW = maxW;
              targetH = Math.round(height * (maxW / width));
            }
            if (maxH && targetH > maxH) {
              targetH = maxH;
              targetW = Math.round(width * (maxH / height));
            }

            if (targetW !== width || targetH !== height) {
              const canvas = new OffscreenCanvas(targetW, targetH);
              const ctx = canvas.getContext('2d')!;
              ctx.drawImage(bitmap, 0, 0, targetW, targetH);
              bitmap.close();

              const resizedBlob = await canvas.convertToBlob({
                type: 'image/jpeg',
                quality: (msg.quality || 60) / 100,
              });
              const arrayBuf = await resizedBlob.arrayBuffer();
              const bytes = new Uint8Array(arrayBuf);
              let binary = '';
              for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
              }
              const resizedDataUrl = `data:image/jpeg;base64,${btoa(binary)}`;

              const screenshot: ScreenshotData = {
                tabId: msg.tabId,
                url: tab.url || '',
                dataUrl: resizedDataUrl,
                width: targetW,
                height: targetH,
              };
              send({
                type: 'snapshot',
                requestId: msg.requestId,
                data: screenshot,
              });
              return;
            }
          }

          bitmap.close();

          const screenshot: ScreenshotData = {
            tabId: msg.tabId,
            url: tab.url || '',
            dataUrl,
            width,
            height,
          };
          send({
            type: 'snapshot',
            requestId: msg.requestId,
            data: screenshot,
          });
        } catch {
          send({
            type: 'snapshot',
            requestId: msg.requestId,
            data: {
              tabId: msg.tabId,
              url: '',
              dataUrl: '',
              width: 0,
              height: 0,
            } as ScreenshotData,
          });
        }
        break;
      }
    }
  }

  // --- Handle messages from content scripts and popup ---
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Content script forwarding intercepted events
    if (message.source === '__spier__' && message.action === 'event') {
      if (!enabled || !sender.tab?.id) return;
      const eventData = {
        ...message.data,
        tabId: sender.tab.id,
        timestamp: Date.now(),
      };
      send({ type: 'event', data: eventData });
      return;
    }

    // Content script forwarding snapshot responses
    if (message.source === '__spier__' && message.action === 'snapshot') {
      send({
        type: 'snapshot',
        requestId: message.requestId,
        data: message.data,
      });
      return;
    }

    // Popup: get current state
    if (message.action === 'getState') {
      chrome.tabs.query({}).then((tabs) => {
        const state: PopupState = {
          enabled,
          connected: connectionState === 'connected',
          reconnecting: connectionState === 'reconnecting',
          serverAddress,
          tabCount: tabs.length,
        };
        sendResponse(state);
      });
      return true;
    }

    // Popup: toggle enabled
    if (message.action === 'toggle') {
      enabled = !enabled;
      chrome.storage.local.set({ enabled });
      if (enabled) {
        connect();
      } else {
        ws?.close();
        ws = null;
        connectionState = 'disconnected';
        updateBadge();
      }
      sendResponse({ enabled });
      return true;
    }

    // Popup: set server address
    if (message.action === 'setAddress') {
      serverAddress = message.address;
      chrome.storage.sync.set({ serverAddress });
      // Storage onChanged will trigger reconnect
      sendResponse({ ok: true });
      return true;
    }
  });

  // --- React to storage changes ---
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.serverAddress?.newValue) {
      const newAddr = changes.serverAddress.newValue;
      if (newAddr !== serverAddress) {
        serverAddress = newAddr;
        ws?.close();
        ws = null;
        if (enabled) {
          connect();
        }
      }
    }
  });

  // --- Badge ---
  function updateBadge() {
    if (!enabled) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    if (connectionState === 'connected') {
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    } else {
      chrome.action.setBadgeText({ text: 'OFF' });
      chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    }
  }

  // --- Keep-alive alarm ---
  chrome.alarms.create('spier-keepalive', { periodInMinutes: 25 / 60 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== 'spier-keepalive') return;
    if (enabled && connectionState !== 'connected') {
      connect();
    }
  });

  // --- Init: read persisted state and connect if enabled ---
  Promise.all([
    chrome.storage.local.get(['enabled']),
    chrome.storage.sync.get(['serverAddress']),
  ]).then(([localData, syncData]) => {
    if (localData.enabled !== undefined) {
      enabled = localData.enabled;
    }
    if (syncData.serverAddress) {
      serverAddress = syncData.serverAddress;
    }
    updateBadge();
    if (enabled) {
      connect();
    }
  });
});
