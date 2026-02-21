export class Client {
  private baseUrl: string;

  constructor(host: string, port: number) {
    this.baseUrl = `http://${host}:${port}`;
  }

  async get(path: string, params?: Record<string, string | number | undefined>): Promise<any> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    return this.request(url.toString());
  }

  async post(path: string, body?: Record<string, any>): Promise<any> {
    return this.request(new URL(path, this.baseUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async del(path: string): Promise<any> {
    return this.request(new URL(path, this.baseUrl).toString(), { method: "DELETE" });
  }

  private async request(url: string, init?: RequestInit): Promise<any> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      throw new Error("Cannot connect to server — is it running?");
    }
    if (res.status === 502) {
      throw new Error("Extension not connected to server.");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res.text();
  }
}
