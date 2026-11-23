export { cn } from "cn";

/** Up to two initials for avatars, e.g. "Asha Rao" -> "AR". */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
