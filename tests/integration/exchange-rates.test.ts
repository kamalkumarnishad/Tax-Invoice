import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { exchangeRates } from "@/db/schema";
import { getRate } from "@/server/services/currency/rates";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;

const request = { from: "USD", to: "INR", date: "2026-11-20", today: "2026-11-23" };
const answer = (body: unknown, status = 200) => vi.fn(async () => Response.json(body, { status }));
const good = () => answer([{ date: "2026-11-20", base: "USD", quote: "INR", rate: 92.68 }]);

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  [alice] = await createUsers(db);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterAll(() => close());
beforeEach(() => db.delete(exchangeRates));

describe("getRate", () => {
  it("fetches once and then answers from storage", async () => {
    const fetchFn = good();
    expect(await getRate(db, request, fetchFn)).toEqual({ rate: "92.68000000", source: "frankfurter" });
    expect(await getRate(db, request, fetchFn)).toEqual({ rate: "92.68000000", source: "frankfurter" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("sends nothing but the codes and the date", async () => {
    const fetchFn = good();
    await getRate(db, request, fetchFn);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.frankfurter.dev/v2/rates?date=2026-11-20&base=USD&quotes=INR");
    expect(init.headers).toBeUndefined();
  });

  it("does not store today's rate, which can still change", async () => {
    await getRate(db, { ...request, date: request.today }, good());
    expect(await db.select().from(exchangeRates)).toEqual([]);
  });

  it("needs no lookup for the same currency", async () => {
    const fetchFn = good();
    expect((await getRate(db, { ...request, to: "USD" }, fetchFn))?.rate).toBe("1");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("has no rate for a future day", async () => {
    const fetchFn = good();
    expect(await getRate(db, { ...request, date: "2026-11-24" }, fetchFn)).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ["an error status", answer({}, 500)],
    ["an empty list", answer([])],
    ["another pair", answer([{ base: "EUR", quote: "INR", rate: 1 }])],
    ["a zero rate", answer([{ base: "USD", quote: "INR", rate: 0 }])],
    ["a negative rate", answer([{ base: "USD", quote: "INR", rate: -5 }])],
    ["a rate that rounds to zero", answer([{ base: "USD", quote: "INR", rate: 1e-12 }])],
    ["text instead of JSON", vi.fn(async () => new Response("<html>"))],
    ["a network failure", vi.fn(async () => Promise.reject(new Error("offline")))],
  ])("gives up on %s and stores nothing", async (_, fetchFn) => {
    expect(await getRate(db, request, fetchFn)).toBeNull();
    expect(await db.select().from(exchangeRates)).toEqual([]);
  });

  it("lets users read the shared rates but not change them", async () => {
    await getRate(db, request, good());
    expect(await runAsUser(db, alice, (tx) => tx.select().from(exchangeRates))).toHaveLength(1);
    await expect(runAsUser(db, alice, (tx) => tx.delete(exchangeRates))).rejects.toThrow();
    await expect(runAsUser(db, alice, (tx) => tx.update(exchangeRates).set({ rate: "1" }))).rejects.toThrow();
  });
});
