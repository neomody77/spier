export default defineUnlistedScript(() => {
  const MAX_BODY = 10 * 1024; // 10KB

  // Save ALL original references before any patching
  const origConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info,
    debug: console.debug,
  };
  const origFetch = window.fetch;
  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;
  const origXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  function truncate(str: string): string {
    return str.length > MAX_BODY ? str.slice(0, MAX_BODY) + '…[truncated]' : str;
  }

  function serialize(value: unknown): string {
    try {
      if (value === undefined) return 'undefined';
      if (value === null) return 'null';
      if (typeof value === 'string') return value;
      if (value instanceof Error)
        return `${value.name}: ${value.message}\n${value.stack || ''}`;
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function post(payload: unknown) {
    try {
      window.postMessage({ source: '__spier__', payload }, '*');
    } catch {
      // Never break the page
    }
  }

  function uid(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    }
  }

  function headersToRecord(headers: Headers): Record<string, string> {
    const obj: Record<string, string> = {};
    headers.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }

  // --- Console patching ---
  try {
    for (const level of ['log', 'warn', 'error', 'info', 'debug'] as const) {
      console[level] = function (...args: unknown[]) {
        try {
          const err = new Error();
          post({
            type: 'console',
            level,
            args: args.map(serialize),
            stack: err.stack,
          });
        } catch {
          // Never break the page
        }
        origConsole[level].apply(console, args);
      };
    }
  } catch {
    // Never break the page
  }

  // --- Fetch patching ---
  try {
    window.fetch = async function (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) {
      const id = uid();
      const method = (init?.method || 'GET').toUpperCase();
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const start = Date.now();

      let requestHeaders: Record<string, string> | undefined;
      try {
        if (init?.headers) {
          if (init.headers instanceof Headers) {
            requestHeaders = headersToRecord(init.headers);
          } else if (Array.isArray(init.headers)) {
            requestHeaders = {};
            for (const [k, v] of init.headers) {
              requestHeaders[k] = v;
            }
          } else {
            requestHeaders = { ...(init.headers as Record<string, string>) };
          }
        }
      } catch {
        // Ignore header read errors
      }

      let requestBody: string | undefined;
      if (init?.body) {
        try {
          requestBody = truncate(
            typeof init.body === 'string' ? init.body : String(init.body),
          );
        } catch {
          requestBody = '[unreadable]';
        }
      }

      post({
        type: 'network',
        id,
        method,
        url,
        requestHeaders,
        requestBody,
      });

      try {
        const response = await origFetch.call(window, input, init);
        const clone = response.clone();

        let responseHeaders: Record<string, string> | undefined;
        try {
          responseHeaders = headersToRecord(response.headers);
        } catch {
          // Ignore header read errors
        }

        clone
          .text()
          .then((body) => {
            post({
              type: 'network',
              id,
              method,
              url,
              status: response.status,
              statusText: response.statusText,
              responseHeaders,
              responseBody: truncate(body),
              duration: Date.now() - start,
            });
          })
          .catch(() => {});

        return response;
      } catch (error) {
        post({
          type: 'network',
          id,
          method,
          url,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - start,
        });
        throw error;
      }
    };
  } catch {
    // Never break the page
  }

  // --- XHR patching ---
  try {
    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      (this as any).__spier = {
        method,
        url: String(url),
        id: uid(),
        start: 0,
        requestHeaders: {} as Record<string, string>,
      };
      return origXhrOpen.apply(this, [method, url, ...rest] as any);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (
      name: string,
      value: string,
    ) {
      try {
        const meta = (this as any).__spier;
        if (meta) {
          meta.requestHeaders[name] = value;
        }
      } catch {
        // Never break the page
      }
      return origXhrSetRequestHeader.call(this, name, value);
    };

    XMLHttpRequest.prototype.send = function (
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      const meta = (this as any).__spier;
      if (meta) {
        meta.start = Date.now();
        let requestBody: string | undefined;
        if (body) {
          try {
            requestBody = truncate(
              typeof body === 'string' ? body : String(body),
            );
          } catch {
            requestBody = '[unreadable]';
          }
        }

        post({
          type: 'network',
          id: meta.id,
          method: meta.method,
          url: meta.url,
          requestHeaders:
            Object.keys(meta.requestHeaders).length > 0
              ? meta.requestHeaders
              : undefined,
          requestBody,
        });

        this.addEventListener('loadend', () => {
          try {
            let responseBody: string | undefined;
            try {
              responseBody = truncate(this.responseText || '');
            } catch {
              responseBody = '[unreadable]';
            }

            // Parse response headers
            let responseHeaders: Record<string, string> | undefined;
            try {
              const raw = this.getAllResponseHeaders();
              if (raw) {
                responseHeaders = {};
                for (const line of raw.trim().split(/[\r\n]+/)) {
                  const idx = line.indexOf(': ');
                  if (idx > 0) {
                    responseHeaders[line.slice(0, idx)] = line.slice(idx + 2);
                  }
                }
              }
            } catch {
              // Ignore header read errors
            }

            post({
              type: 'network',
              id: meta.id,
              method: meta.method,
              url: meta.url,
              status: this.status,
              statusText: this.statusText,
              responseHeaders,
              responseBody,
              duration: Date.now() - meta.start,
            });
          } catch {
            // Never break the page
          }
        });
      }

      return origXhrSend.call(this, body);
    };
  } catch {
    // Never break the page
  }

  // --- Error listeners ---
  try {
    window.addEventListener('error', (event) => {
      try {
        post({
          type: 'error',
          message: event.message || String(event.error),
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          isUnhandledRejection: false,
        });
      } catch {
        // Never break the page
      }
    });

    window.addEventListener('unhandledrejection', (event) => {
      try {
        const reason = event.reason;
        post({
          type: 'error',
          message: reason instanceof Error ? reason.message : String(reason),
          stack: reason instanceof Error ? reason.stack : undefined,
          isUnhandledRejection: true,
        });
      } catch {
        // Never break the page
      }
    });
  } catch {
    // Never break the page
  }
});
