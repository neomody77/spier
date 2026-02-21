export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
    // All postMessage communication uses JSON strings with a unique prefix
    // to avoid conflicts with page scripts that blindly JSON.parse(event.data).
    const MSG_PREFIX = '\x00__spier__\x00';

    // Check if this tab is in the _Spier group before doing anything.
    // Only tabs explicitly managed by Spier should have injection + monitoring.
    let initialized = false;

    function tryInit() {
      if (initialized) return;
      initialized = true;
      initSpier(MSG_PREFIX);
    }

    // Listen for late-join notification from background (if tab gets grouped
    // after the content script has already started and checked)
    chrome.runtime.onMessage.addListener((message) => {
      if (message.source === '__spier__' && message.action === 'spierGroupJoined') {
        tryInit();
      }
    });

    chrome.runtime.sendMessage(
      { source: '__spier__', action: 'checkSpierGroup' },
      (response) => {
        if (chrome.runtime.lastError || !response?.inGroup) {
          // Not in _Spier group — do nothing for now.
          // If the tab is later added to the group, the spierGroupJoined
          // listener above will trigger initialization.
          return;
        }
        tryInit();
      },
    );
  },
});

function initSpier(MSG_PREFIX: string) {
    // Inject MAIN world script for page-level interception
    injectScript('/injected.js', { keepInDom: true });

    // Listen for messages from MAIN world (injected script via postMessage)
    // Content script also batches before forwarding to background to reduce IPC
    let forwardQueue: unknown[] = [];
    let forwardTimer: ReturnType<typeof setTimeout> | null = null;
    const FORWARD_INTERVAL = 200;
    const MAX_FORWARD = 50;

    function flushForward() {
      forwardTimer = null;
      if (forwardQueue.length === 0) return;
      const batch = forwardQueue.length > MAX_FORWARD
        ? forwardQueue.slice(-MAX_FORWARD)
        : forwardQueue;
      forwardQueue = [];
      chrome.runtime.sendMessage({
        source: '__spier__',
        action: 'eventBatch',
        batch,
      });
    }

    function enqueueEvent(payload: unknown) {
      forwardQueue.push(payload);
      if (!forwardTimer) {
        forwardTimer = setTimeout(flushForward, FORWARD_INTERVAL);
      }
    }

    window.addEventListener('message', (event) => {
      // Only accept string messages with our prefix
      if (typeof event.data !== 'string' || !event.data.startsWith(MSG_PREFIX)) return;
      let msg: any;
      try { msg = JSON.parse(event.data.slice(MSG_PREFIX.length)); } catch { return; }

      // Batched events from injected script
      if (Array.isArray(msg.batch)) {
        for (const payload of msg.batch) {
          if (payload?.type) enqueueEvent(payload);
        }
        return;
      }

      // executeJs result from injected script
      if (msg.source === '__spier_exec_result__') {
        // Re-dispatch as a custom event so the executeJs handler below can pick it up
        window.dispatchEvent(new CustomEvent('__spier_exec_result__', { detail: msg }));
      }
    });

    // Register the full command listener (includes executeJs which needs injected.js)
    registerCommandListener(MSG_PREFIX);
}

function registerCommandListener(MSG_PREFIX: string) {
    // Handle requests from background service worker
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.source !== '__spier__') return false;

      if (message.action === 'getStorage') {
        try {
          const ls: Record<string, string> = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key !== null) {
              ls[key] = localStorage.getItem(key) || '';
            }
          }

          const ss: Record<string, string> = {};
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key !== null) {
              ss[key] = sessionStorage.getItem(key) || '';
            }
          }

          sendResponse({
            localStorage: ls,
            sessionStorage: ss,
            url: location.href,
          });
        } catch {
          sendResponse({
            localStorage: {},
            sessionStorage: {},
            url: location.href,
          });
        }
        return true;
      }

      if (message.action === 'getDOM') {
        try {
          const MAX_HTML = 100 * 1024; // 100KB
          let html = document.documentElement.outerHTML;
          if (html.length > MAX_HTML) {
            html = html.slice(0, MAX_HTML) + '…[truncated]';
          }
          sendResponse({
            html,
            title: document.title,
            url: location.href,
          });
        } catch {
          sendResponse({
            html: '',
            title: document.title || '',
            url: location.href,
          });
        }
        return true;
      }

      if (message.action === 'click') {
        try {
          const el = document.querySelector(message.selector);
          if (!el) { sendResponse({ success: false, error: `Element not found: ${message.selector}` }); return true; }
          (el as HTMLElement).click();
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: (e as Error).message });
        }
        return true;
      }

      if (message.action === 'fill') {
        try {
          const el = document.querySelector(message.selector);
          if (!el) { sendResponse({ success: false, error: `Element not found: ${message.selector}` }); return true; }
          const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
            || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(el, message.value);
          } else {
            (el as HTMLInputElement).value = message.value;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: (e as Error).message });
        }
        return true;
      }

      if (message.action === 'type') {
        (async () => {
          try {
            const el = document.querySelector(message.selector);
            if (!el) { sendResponse({ success: false, error: `Element not found: ${message.selector}` }); return; }
            (el as HTMLElement).focus();
            const delay = message.delay || 0;
            for (const char of message.text) {
              el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
              el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
              el.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
              // Update value
              const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
                || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
              if (nativeSetter) {
                nativeSetter.call(el, (el as HTMLInputElement).value + char);
              } else {
                (el as HTMLInputElement).value += char;
              }
              el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
              if (delay > 0) await new Promise(r => setTimeout(r, delay));
            }
            sendResponse({ success: true });
          } catch (e) {
            sendResponse({ success: false, error: (e as Error).message });
          }
        })();
        return true;
      }

      if (message.action === 'waitForSelector') {
        const timeout = message.timeout || 5000;
        const existing = document.querySelector(message.selector);
        if (existing) {
          sendResponse({ success: true });
          return true;
        }
        let resolved = false;
        const POLL_INTERVAL = 100;
        const pollTimer = setInterval(() => {
          if (resolved) return;
          if (document.querySelector(message.selector)) {
            resolved = true;
            clearInterval(pollTimer);
            sendResponse({ success: true });
          }
        }, POLL_INTERVAL);
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            clearInterval(pollTimer);
            sendResponse({ success: false, error: `Timeout waiting for selector: ${message.selector}` });
          }
        }, timeout);
        return true;
      }

      if (message.action === 'executeJs') {
        const execId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        let resolved = false;
        const handler = (event: Event) => {
          if (resolved) return;
          const detail = (event as CustomEvent).detail;
          if (detail?.id === execId) {
            resolved = true;
            window.removeEventListener('__spier_exec_result__', handler);
            sendResponse({ success: detail.success, data: detail.data, error: detail.error });
          }
        };
        window.addEventListener('__spier_exec_result__', handler);
        // Send to injected script (MAIN world) via string-prefixed postMessage
        window.postMessage(MSG_PREFIX + JSON.stringify({ source: '__spier_exec__', id: execId, code: message.code }), '*');
        // Timeout after 10 seconds
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            window.removeEventListener('__spier_exec_result__', handler);
            sendResponse({ success: false, error: 'executeJs timed out' });
          }
        }, 10000);
        return true;
      }

      return false;
    });
}
