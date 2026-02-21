// ANSI color helpers
const esc = (code: string) => `\x1b[${code}m`;
const reset = esc("0");

export const dim = (s: string) => `${esc("2")}${s}${reset}`;
export const bold = (s: string) => `${esc("1")}${s}${reset}`;
export const red = (s: string) => `${esc("31")}${s}${reset}`;
export const green = (s: string) => `${esc("32")}${s}${reset}`;
export const yellow = (s: string) => `${esc("33")}${s}${reset}`;
export const cyan = (s: string) => `${esc("36")}${s}${reset}`;
export const magenta = (s: string) => `${esc("35")}${s}${reset}`;

export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function table(rows: Record<string, string>[], columns: { key: string; label: string }[]): void {
  if (rows.length === 0) {
    console.log(dim("  (no results)"));
    return;
  }
  // Calculate column widths
  const widths = columns.map((col) => {
    const vals = rows.map((r) => String(r[col.key] ?? "").length);
    return Math.max(col.label.length, ...vals);
  });

  // Header
  const header = columns.map((col, i) => bold(col.label.padEnd(widths[i]))).join("  ");
  console.log(header);
  console.log(dim(widths.map((w) => "─".repeat(w)).join("──")));

  // Rows
  for (const row of rows) {
    const line = columns.map((col, i) => String(row[col.key] ?? "").padEnd(widths[i])).join("  ");
    console.log(line);
  }
}

export function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms3 = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms3}`;
}

export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
