import "server-only";
import { countryCodes } from "./countries";

// Server only: browsers and Node name some countries differently, which would
// make the page differ from its server-rendered HTML.
const names = new Intl.DisplayNames("en", { type: "region" });

export function countryName(code: string): string {
  return names.of(code) ?? code;
}

export const countryOptions = [...countryCodes]
  .map((value) => ({ value, label: countryName(value) }))
  .sort((a, b) => a.label.localeCompare(b.label, "en"));
