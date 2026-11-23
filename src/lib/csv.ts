/**
 * A cell that starts like a formula would run when a spreadsheet opens the
 * file, so it gets a leading apostrophe. Plain numbers are left alone.
 */
function neutralise(value: string): string {
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  return /^\s*[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
}

function cell(value: string): string {
  const safe = neutralise(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** RFC 4180, with a byte order mark so Excel reads it as UTF-8. */
export function toCsv(header: string[], rows: (string | null)[][]): string {
  const lines = [header, ...rows].map((row) => row.map((value) => cell(value ?? "")).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
