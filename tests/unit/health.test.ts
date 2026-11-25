import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

const secret = "a-cron-secret-of-at-least-32-characters";
const execute = vi.hoisted(() => vi.fn());
vi.mock("@/config/env", () => ({ env: { CRON_SECRET: "a-cron-secret-of-at-least-32-characters" } }));
vi.mock("@/lib/db", () => ({ getDb: async () => ({ execute }) }));

const ask = (authorization?: string) =>
  GET(new Request("http://localhost/api/health", { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  execute.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("the health check", () => {
  it.each([undefined, "Bearer wrong"])("answers anyone without touching the database (%s)", async (authorization) => {
    const response = await ask(authorization);
    expect([response.status, await response.json()]).toEqual([200, { status: "ok" }]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(execute).not.toHaveBeenCalled();
  });

  it("checks the database with the secret", async () => {
    const response = await ask(`Bearer ${secret}`);
    expect([response.status, await response.json()]).toEqual([200, { status: "ok", database: "ok" }]);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("reports a database that is down, without saying why", async () => {
    execute.mockRejectedValue(new Error("connect ECONNREFUSED secret-host"));
    const response = await ask(`Bearer ${secret}`);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-host");
  });
});
