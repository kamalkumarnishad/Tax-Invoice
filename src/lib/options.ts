/** All time zones, under India's current name and always including the saved one. */
export function timezoneOptions(selected: string) {
  const zones = new Set(Intl.supportedValuesOf("timeZone").filter((zone) => zone !== "Asia/Calcutta"));
  zones.add("Asia/Kolkata").add(selected);
  return [...zones].sort().map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }));
}

const browsers: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const systems: [RegExp, string][] = [
  [/iPhone|iPad/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X/, "macOS"],
  [/Linux/, "Linux"],
];

/** A short label for the session list, e.g. "Chrome on Windows". */
export function describeDevice(userAgent: string | null | undefined): string {
  const find = (list: [RegExp, string][]) => list.find(([pattern]) => pattern.test(userAgent ?? ""))?.[1];
  const browser = find(browsers);
  const system = find(systems);
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? "Unknown device";
}
