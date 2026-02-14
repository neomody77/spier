import type {
  ServerRequest,
  ExtensionMessage,
  TabInfo,
  StorageSnapshot,
  DOMSnapshot,
  ScreenshotData,
  AccessibilityNode,
} from '../../shared/types';
import type { PopupState } from '../utils/types';

export default defineBackground(() => {
  // --- State ---
  let ws: WebSocket | null = null;
  let connectionState: 'connected' | 'disconnected' | 'reconnecting' =
    'disconnected';
  let enabled = false;
  let serverAddress = 'localhost:12333';

  const RECONNECT_DELAY = 3000;

  // --- Tab grouping ---
  let spierGroupId: number | null = null;

  async function ensureSpierGroup(tabId: number): Promise<void> {
    try {
      // Check if our cached group still exists
      if (spierGroupId != null) {
        const groups = await chrome.tabGroups.query({ title: '_Spier' });
        if (!groups.some(g => g.id === spierGroupId)) {
          spierGroupId = null;
        }
      }

      if (spierGroupId == null) {
        const existing = await chrome.tabGroups.query({ title: '_Spier' });
        if (existing.length > 0) {
          spierGroupId = existing[0].id;
        }
      }

      if (spierGroupId != null) {
        await chrome.tabs.group({ tabIds: [tabId], groupId: spierGroupId });
      } else {
        spierGroupId = await chrome.tabs.group({ tabIds: [tabId] });
        await chrome.tabGroups.update(spierGroupId, { title: '_Spier', color: 'cyan' });
      }
    } catch {
      // Never block tab operations if grouping fails
    }
  }

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

      // --- Navigation ---
      case 'navigate': {
        try {
          await chrome.tabs.update(msg.tabId, { url: msg.url });
          await ensureSpierGroup(msg.tabId);
          send({ type: 'result', requestId: msg.requestId, success: true });
        } catch (e) {
          send({ type: 'result', requestId: msg.requestId, success: false, error: (e as Error).message });
        }
        break;
      }

      case 'goBack': {
        try {
          await chrome.tabs.goBack(msg.tabId);
          send({ type: 'result', requestId: msg.requestId, success: true });
        } catch (e) {
          send({ type: 'result', requestId: msg.requestId, success: false, error: (e as Error).message });
        }
        break;
      }

      case 'goForward': {
        try {
          await chrome.tabs.goForward(msg.tabId);
          send({ type: 'result', requestId: msg.requestId, success: true });
        } catch (e) {
          send({ type: 'result', requestId: msg.requestId, success: false, error: (e as Error).message });
        }
        break;
      }

      case 'reload': {
        try {
          await chrome.tabs.reload(msg.tabId);
          send({ type: 'result', requestId: msg.requestId, success: true });
        } catch (e) {
          send({ type: 'result', requestId: msg.requestId, success: false, error: (e as Error).message });
        }
        break;
      }

      // --- Tab management ---
      case 'createTab': {
        try {
          const tab = await chrome.tabs.create({ url: msg.url || 'about:blank' });
          if (tab.id != null) await ensureSpierGroup(tab.id);
          send({ type: 'result', requestId: msg.requestId, success: true, data: { tabId: tab.id, url: tab.url || msg.url || 'about:blank' } });
        } catch (e) {
          send({ type: 'result', requestId: msg.requestId, success: false, error: (e as Error).message });
        }
        break;
      }

      case 'closeTab': {
        try {
          await chrome.tabs.remove(msg.tabId);
          send({ type: 'result', requestId: msg.requestId, success: true });
        } catch (e) {
          send({ type: 'result', requestId: msg.requestId, success: false, error: (e as Error).message });
        }
        break;
      }

      case 'activateTab': {
        try {
          const tab = await chrome.tabs.update(msg.tabId, { active: true });
          if (tab.windowId) {
            await chrome.windows.update(tab.windowId, { focused: true });
          }
          send({ type: 'result', requestId: msg.requestId, success: true });
        } catch (e) {
          send({ type: 'result', requestId: msg.requestId, success: false, error: (e as Error).message });
        }
        break;
      }

      // --- Wait for navigation ---
      case 'waitForNavigation': {
        const timeout = msg.timeout || 10000;
        let resolved = false;

        const listener = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
          if (resolved || tabId !== msg.tabId) return;
          if (changeInfo.status === 'complete') {
            resolved = true;
            chrome.tabs.onUpdated.removeListener(listener);
            send({ type: 'result', requestId: msg.requestId, success: true });
          }
        };

        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            chrome.tabs.onUpdated.removeListener(listener);
            send({ type: 'result', requestId: msg.requestId, success: false, error: 'waitForNavigation timed out' });
          }
        }, timeout);
        break;
      }

      // --- Content script forwarded actions ---
      case 'click':
      case 'fill':
      case 'type':
      case 'waitForSelector':
      case 'executeJs': {
        try {
          const response = await chrome.tabs.sendMessage(msg.tabId, {
            source: '__spier__',
            action: msg.type,
            requestId: msg.requestId,
            ...(msg.type === 'click' && { selector: msg.selector }),
            ...(msg.type === 'fill' && { selector: msg.selector, value: msg.value }),
            ...(msg.type === 'type' && { selector: msg.selector, text: msg.text, delay: msg.delay }),
            ...(msg.type === 'waitForSelector' && { selector: msg.selector, timeout: msg.timeout }),
            ...(msg.type === 'executeJs' && { code: msg.code }),
          });
          send({ type: 'result', requestId: msg.requestId, success: response.success, data: response.data, error: response.error });
        } catch (e) {
          send({ type: 'result', requestId: msg.requestId, success: false, error: (e as Error).message });
        }
        break;
      }

      // --- Accessibility snapshot (CDP) ---
      case 'getAccessibilitySnapshot': {
        try {
          const target = { tabId: msg.tabId };
          await chrome.debugger.attach(target, '1.3');
          try {
            const result = await chrome.debugger.sendCommand(target, 'Accessibility.getFullAXTree') as {
              nodes: Array<{
                nodeId: string;
                parentId?: string;
                ignored?: boolean;
                role?: { value: string };
                name?: { value: string };
                value?: { value: string };
                description?: { value: string };
                properties?: Array<{ name: string; value: { value: unknown } }>;
                childIds?: string[];
              }>;
            };

            const tab = await chrome.tabs.get(msg.tabId);
            const nodes = result.nodes;

            // Filter out noise
            const SKIP_ROLES = new Set(['none', 'GenericContainer', 'InlineTextBox']);
            const validNodes = nodes.filter(n => {
              if (n.ignored) return false;
              const role = n.role?.value;
              if (role && SKIP_ROLES.has(role)) return false;
              return true;
            });

            // Build id → node map
            const nodeMap = new Map<string, typeof validNodes[0]>();
            for (const n of validNodes) nodeMap.set(n.nodeId, n);

            // Assign refs
            let refCounter = 0;
            const refMap = new Map<string, string>();
            for (const n of validNodes) {
              refMap.set(n.nodeId, `e${++refCounter}`);
            }

            // Build tree
            function buildNode(cdpNode: typeof validNodes[0]): AccessibilityNode {
              const ref = refMap.get(cdpNode.nodeId) || `e${++refCounter}`;
              const props = new Map<string, unknown>();
              if (cdpNode.properties) {
                for (const p of cdpNode.properties) {
                  props.set(p.name, p.value.value);
                }
              }

              const node: AccessibilityNode = {
                ref,
                role: cdpNode.role?.value || 'unknown',
                name: cdpNode.name?.value || '',
              };

              if (cdpNode.value?.value) node.value = cdpNode.value.value;
              if (cdpNode.description?.value) node.description = cdpNode.description.value;
              if (props.get('focused') === true) node.focused = true;
              if (props.get('disabled') === true) node.disabled = true;
              if (props.has('checked')) {
                const v = props.get('checked');
                node.checked = v === 'mixed' ? 'mixed' : v === true || v === 'true';
              }
              if (props.has('expanded')) node.expanded = props.get('expanded') === true;
              if (props.has('selected')) node.selected = props.get('selected') === true;
              if (props.has('level')) node.level = props.get('level') as number;

              // Build children
              if (cdpNode.childIds) {
                const children: AccessibilityNode[] = [];
                for (const childId of cdpNode.childIds) {
                  const childCdp = nodeMap.get(childId);
                  if (childCdp) {
                    children.push(buildNode(childCdp));
                  }
                }
                if (children.length > 0) node.children = children;
              }

              return node;
            }

            // Find root (first node without parent or first node)
            const root = validNodes.find(n => !n.parentId || !nodeMap.has(n.parentId)) || validNodes[0];
            const tree = root ? buildNode(root) : { ref: 'e0', role: 'RootWebArea', name: '' };

            send({
              type: 'result',
              requestId: msg.requestId,
              success: true,
              data: {
                tabId: msg.tabId,
                url: tab.url || '',
                title: tab.title || '',
                tree,
              },
            });
          } finally {
            try { await chrome.debugger.detach(target); } catch {}
          }
        } catch (e) {
          send({ type: 'result', requestId: msg.requestId, success: false, error: (e as Error).message });
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
