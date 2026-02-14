import type {
  SpierEvent,
  SpierEventType,
  NetworkEvent,
  ConsoleEvent,
  ErrorEvent,
} from "../../shared/types.js";

class RingBuffer<T> {
  private buf: T[];
  private head = 0;
  private count = 0;

  constructor(private capacity: number) {
    this.buf = new Array(capacity);
  }

  push(item: T) {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  toArray(): T[] {
    if (this.count < this.capacity) return this.buf.slice(0, this.count);
    return [...this.buf.slice(this.head), ...this.buf.slice(0, this.head)];
  }

  clear() {
    this.buf = new Array(this.capacity);
    this.head = 0;
    this.count = 0;
  }
}

export class EventStore {
  private network = new RingBuffer<NetworkEvent>(500);
  private console = new RingBuffer<ConsoleEvent>(500);
  private errors = new RingBuffer<ErrorEvent>(500);

  addEvent(event: SpierEvent) {
    switch (event.type) {
      case "network":
        this.network.push(event);
        break;
      case "console":
        this.console.push(event);
        break;
      case "error":
        this.errors.push(event);
        break;
    }
  }

  getEvents(opts: { type?: SpierEventType; tabId?: number; limit?: number } = {}): SpierEvent[] {
    if (opts.type === "network") return this.getNetworkEvents(opts);
    if (opts.type === "console") return this.getConsoleEvents(opts);
    if (opts.type === "error") return this.getErrors(opts);

    const all: SpierEvent[] = [
      ...this.network.toArray(),
      ...this.console.toArray(),
      ...this.errors.toArray(),
    ];
    all.sort((a, b) => a.timestamp - b.timestamp);
    return applyFilter(all, opts.tabId, opts.limit);
  }

  getNetworkEvents(opts: { tabId?: number; limit?: number; url?: string; method?: string } = {}): NetworkEvent[] {
    let items = this.network.toArray();
    if (opts.tabId != null) items = items.filter((e) => e.tabId === opts.tabId);
    if (opts.url) items = items.filter((e) => e.url.includes(opts.url!));
    if (opts.method) items = items.filter((e) => e.method.toLowerCase() === opts.method!.toLowerCase());
    if (opts.limit != null && opts.limit > 0) items = items.slice(-opts.limit);
    return items;
  }

  getConsoleEvents(opts: { tabId?: number; limit?: number; level?: string } = {}): ConsoleEvent[] {
    let items = this.console.toArray();
    if (opts.tabId != null) items = items.filter((e) => e.tabId === opts.tabId);
    if (opts.level) items = items.filter((e) => e.level === opts.level);
    if (opts.limit != null && opts.limit > 0) items = items.slice(-opts.limit);
    return items;
  }

  getErrors(opts: { tabId?: number; limit?: number } = {}): ErrorEvent[] {
    let items = this.errors.toArray();
    if (opts.tabId != null) items = items.filter((e) => e.tabId === opts.tabId);
    if (opts.limit != null && opts.limit > 0) items = items.slice(-opts.limit);
    return items;
  }

  clear() {
    this.network.clear();
    this.console.clear();
    this.errors.clear();
  }
}

function applyFilter<T extends { tabId: number }>(items: T[], tabId?: number, limit?: number): T[] {
  let result = tabId != null ? items.filter((e) => e.tabId === tabId) : items;
  if (limit != null && limit > 0) result = result.slice(-limit);
  return result;
}

export const store = new EventStore();
