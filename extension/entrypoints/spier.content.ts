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

      return false;
    });
  },
});
