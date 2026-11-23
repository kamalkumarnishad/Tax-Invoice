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
const ecb = (body: object = {}) => ({ base: "USD", date: "2026-11-20", rates: { INR: 92.68 }, ...body });
const good = () => answer(ecb());

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
    expect(await getRate(db, request, fetchFn)).toEqual({ rate: "92.68000000", source: "European Central Bank" });
    expect(await getRate(db, request, fetchFn)).toEqual({ rate: "92.68000000", source: "European Central Bank" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("sends nothing but the codes and the date", async () => {
    const fetchFn = good();
    await getRate(db, request, fetchFn);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.frankfurter.dev/v1/2026-11-20?base=USD&symbols=INR");
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

  it("falls back to the average without storing it", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ message: "not found" }, { status: 404 }))
      .mockResolvedValueOnce(Response.json([{ base: "AED", quote: "INR", rate: 25.301 }]));
    const rate = await getRate(db, { ...request, from: "AED" }, fetchFn);
    expect(rate).toEqual({ rate: "25.30100000", source: "Central bank average" });
    expect(await db.select().from(exchangeRates)).toEqual([]);
  });

  it.each([
    ["an error status", answer({}, 500)],
    ["an empty list", answer([])],
    ["another base", answer(ecb({ base: "EUR" }))],
    ["another target", answer(ecb({ rates: { EUR: 1 } }))],
    ["a zero rate", answer(ecb({ rates: { INR: 0 } }))],
    ["a negative rate", answer(ecb({ rates: { INR: -5 } }))],
    ["a rate that rounds to zero", answer(ecb({ rates: { INR: 1e-12 } }))],
    ["an average for another pair", answer([{ base: "EUR", quote: "INR", rate: 1 }])],
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
