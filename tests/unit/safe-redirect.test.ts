import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/validations/auth";

describe("safeRedirectPath", () => {
  it.each(["/app/income", "/app/income?page=2"])("keeps %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path);
  });

  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/\t/evil.test",
    "/\n/evil.test",
    "javascript:alert(1)",
    "",
    undefined,
    ["/a"],
  ])("replaces %j with the dashboard", (value) => {
    expect(safeRedirectPath(value)).toBe("/app/dashboard");
  });
});
