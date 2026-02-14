export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',

  main() {
    // Inject MAIN world script for page-level interception
    injectScript('/injected.js', { keepInDom: true });

    // Listen for messages from MAIN world (injected script via postMessage)
    window.addEventListener('message', (event) => {
      if (event.data?.source !== '__spier__') return;

      const payload = event.data.payload;
      if (!payload?.type) return;

      chrome.runtime.sendMessage({
        source: '__spier__',
        action: 'event',
        data: payload,
      });
    });

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
        const observer = new MutationObserver(() => {
          if (resolved) return;
          if (document.querySelector(message.selector)) {
            resolved = true;
            observer.disconnect();
            sendResponse({ success: true });
          }
        });
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            observer.disconnect();
            sendResponse({ success: false, error: `Timeout waiting for selector: ${message.selector}` });
          }
        }, timeout);
        return true;
      }

      if (message.action === 'executeJs') {
        const execId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        let resolved = false;
        const handler = (event: MessageEvent) => {
          if (resolved) return;
          if (event.data?.source === '__spier_exec_result__' && event.data.id === execId) {
            resolved = true;
            window.removeEventListener('message', handler);
            sendResponse({ success: event.data.success, data: event.data.data, error: event.data.error });
          }
        };
        window.addEventListener('message', handler);
        window.postMessage({ source: '__spier_exec__', id: execId, code: message.code }, '*');
        // Timeout after 10 seconds
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            window.removeEventListener('message', handler);
            sendResponse({ success: false, error: 'executeJs timed out' });
          }
        }, 10000);
        return true;
      }

      return false;
    });
  },
});
