import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { exchangeRates, rateRefreshes, referenceRates } from "@/db/schema";
import { expectedDate, HISTORY_START, refreshIfStale, refreshRates } from "@/server/services/currency-analyzer/refresh";
import type { Fetch } from "@/server/services/currency-analyzer/sources";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;

// Monday evening in Frankfurt, after that day's rates.
const now = new Date("2026-11-23T18:00:00Z");
const usual = { AUD: 1.6, CAD: 1.5, GBP: 0.84, INR: 101.6, JPY: 174, SGD: 1.4, USD: 1.1 };

type Days = Record<string, Partial<typeof usual>>;
const json = (body: unknown) => Response.json(body);
const ecbReply = (rates: Days) => json({ amount: 1, base: "EUR", rates });
const aedReply = (rates: Record<string, number>) =>
  json(Object.entries(rates).map(([date, rate]) => ({ date, base: "USD", quote: "AED", rate })));
const xml = (days: Days) =>
  new Response(
    `<?xml version="1.0"?><Envelope><Cube>${Object.entries(days)
      .map(
        ([date, rates]) =>
          `<Cube time="${date}">${Object.entries({ ...rates, CZK: 24 })
            .map(([code, rate]) => `<Cube currency="${code}" rate="${rate}"/>`)
            .join("")}</Cube>`,
      )
      .join("")}</Cube></Envelope>`,
  );

type Replies = { ecb?: () => Response; aed?: () => Response; backup?: () => Response };
const down = () => new Response("", { status: 503 });
function network({ ecb = down, aed = down, backup = down }: Replies) {
  return vi.fn<Fetch>(async (url) => {
    if (url.startsWith("https://api.frankfurter.dev/v1/")) return ecb();
    if (url.startsWith("https://api.frankfurter.dev/v2/")) return aed();
    if (url.startsWith("https://www.ecb.europa.eu/")) return backup();
    throw new Error(`unexpected address ${url}`);
  });
}
const twoDays = { "2026-11-20": usual, "2026-11-23": usual };
const dirhams = { "2026-11-20": 3.6725, "2026-11-21": 3.6725, "2026-11-23": 3.6725 };
const healthy = () => network({ ecb: () => ecbReply(twoDays), aed: () => aedReply(dirhams) });
const rows = (currency: string) =>
  db.select().from(referenceRates).where(eq(referenceRates.currency, currency)).orderBy(asc(referenceRates.rateDate));
const dates = async (currency: string) => (await rows(currency)).map((row) => row.rateDate);
const seed = (date: string, rate = "101.6", currency = "INR", baseCurrency = "EUR") =>
  db.insert(referenceRates).values({ currency, rateDate: date, baseCurrency, rate, source: "test" });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  [alice] = await createUsers(db);
});
afterAll(() => close());
beforeEach(async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await db.delete(referenceRates);
  await db.delete(rateRefreshes);
});
afterEach(() => vi.restoreAllMocks());

describe("saving rates", () => {
  it("loads the whole history into an empty table", async () => {
    const fetchFn = healthy();
    expect(await refreshRates(db, { now, fetchFn })).toEqual({ saved: 16, failed: [] });
    expect(fetchFn.mock.calls[0]![0]).toContain(`/v1/${HISTORY_START}..2026-11-23?base=EUR`);
    expect(await rows("INR")).toMatchObject([
      { rateDate: "2026-11-20", baseCurrency: "EUR", rate: "101.60000000", source: "European Central Bank" },
      { rateDate: "2026-11-23" },
    ]);
  });

  it("then asks only for later days", async () => {
    await refreshRates(db, { now, fetchFn: healthy() });
    const later = network({
      ecb: () => ecbReply({ "2026-11-24": usual }),
      aed: () => aedReply({ "2026-11-24": 3.6725 }),
    });
    expect(await refreshRates(db, { now: new Date("2026-11-24T18:00:00Z"), fetchFn: later })).toEqual({
      saved: 8,
      failed: [],
    });
    expect(later.mock.calls.map(([url]) => url)).toEqual([
      expect.stringContaining("/v1/2026-11-24..2026-11-24?"),
      expect.stringContaining("from=2026-11-24&to=2026-11-24"),
    ]);
  });

  it("keeps dirhams only for days the ECB published", async () => {
    await refreshRates(db, { now, fetchFn: healthy() });
    expect(await dates("AED")).toEqual(["2026-11-20", "2026-11-23"]);
    expect((await rows("AED"))[0]).toMatchObject({ baseCurrency: "USD", source: "Central bank average" });
  });

  it("ignores days that were not asked for", async () => {
    await seed("2026-11-20");
    const fetchFn = network({ ecb: () => ecbReply({ "2026-11-20": usual, "2026-11-30": usual }) });
    await refreshRates(db, { now, fetchFn });
    expect(await dates("USD")).toEqual([]);
  });

  it("saves nothing twice", async () => {
    await refreshRates(db, { now, fetchFn: healthy() });
    await db.delete(referenceRates).where(eq(referenceRates.rateDate, "2026-11-23"));
    await refreshRates(db, { now, fetchFn: healthy() });
    expect(await dates("INR")).toEqual(["2026-11-20", "2026-11-23"]);
  });

  it("leaves the rates used on records alone", async () => {
    await refreshRates(db, { now, fetchFn: healthy() });
    expect(await db.select().from(exchangeRates)).toEqual([]);
  });

  it("sends nothing but currencies and dates, and follows no redirects", async () => {
    const fetchFn = healthy();
    await refreshRates(db, { now, fetchFn });
    for (const [url, init] of fetchFn.mock.calls) {
      expect(init).toMatchObject({ redirect: "error", cache: "no-store" });
      expect(init.headers).toBeUndefined();
      expect(init.body).toBeUndefined();
      expect([...new URL(url).searchParams.keys()].every((key) => /^(base|symbols|from|to|quotes)$/.test(key))).toBe(true);
    }
  });
});

describe("when a source fails", () => {
  it("uses the ECB's own file", async () => {
    await seed("2026-11-20");
    const fetchFn = network({ backup: () => xml(twoDays), aed: () => aedReply(dirhams) });
    expect(await refreshRates(db, { now, fetchFn })).toEqual({ saved: 9, failed: [] });
    expect(await dates("USD")).toEqual(["2026-11-23"]);
  });

  it("does not fill an empty table from the short backup", async () => {
    const fetchFn = network({ backup: () => xml(twoDays) });
    expect(await refreshRates(db, { now, fetchFn })).toEqual({ saved: 0, failed: ["European Central Bank"] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("keeps what is saved, and reports both", async () => {
    await seed("2026-11-20");
    await seed("2026-11-20", "1.1", "USD");
    expect(await refreshRates(db, { now, fetchFn: network({}) })).toEqual({
      saved: 0,
      failed: ["European Central Bank", "Central bank average"],
    });
    expect(await dates("INR")).toEqual(["2026-11-20"]);
  });

  it("saves the other currencies when only the dirham fails", async () => {
    const fetchFn = network({ ecb: () => ecbReply(twoDays) });
    expect(await refreshRates(db, { now, fetchFn })).toEqual({ saved: 14, failed: ["Central bank average"] });
  });

  it.each([
    ["not JSON", () => new Response("<html>")],
    ["another base", () => json({ base: "USD", rates: twoDays })],
    ["a negative rate", () => ecbReply({ "2026-11-23": { INR: -1 } })],
    ["a zero rate", () => ecbReply({ "2026-11-23": { INR: 0 } })],
    ["text for a rate", () => json({ base: "EUR", rates: { "2026-11-23": { INR: "101" } } })],
    ["a date that does not exist", () => ecbReply({ "2026-02-30": usual })],
    ["an enormous reply", () => new Response("x".repeat(2_100_000))],
  ])("refuses %s", async (_, ecb) => {
    const result = await refreshRates(db, { now, fetchFn: network({ ecb }) });
    expect(result).toEqual({ saved: 0, failed: ["European Central Bank"] });
    expect(await db.select().from(referenceRates)).toEqual([]);
  });

  it.each([
    ["has no rates", () => new Response("<Envelope/>")],
    ["has a zero rate", () => xml({ "2026-11-23": { INR: 0 } })],
  ])("refuses a backup that %s", async (_, backup) => {
    await seed("2026-11-20");
    expect((await refreshRates(db, { now, fetchFn: network({ backup }) })).failed).toContain("European Central Bank");
    expect(await dates("INR")).toEqual(["2026-11-20"]);
  });
});

describe("a jump of more than 10%", () => {
  const jump = { "2026-11-23": { ...usual, INR: 150 } };
  beforeEach(() => seed("2026-11-20"));

  it("is saved when the ECB's own file agrees", async () => {
    await refreshRates(db, { now, fetchFn: network({ ecb: () => ecbReply(jump), backup: () => xml(jump) }) });
    expect(await dates("INR")).toEqual(["2026-11-20", "2026-11-23"]);
  });

  it.each([
    ["differs", () => xml(twoDays)],
    ["is down", down],
    ["has no such day", () => xml({ "2026-11-20": usual })],
  ])("is held back when that file %s", async (_, backup) => {
    const result = await refreshRates(db, { now, fetchFn: network({ ecb: () => ecbReply(jump), backup }) });
    expect(result.failed).toContain("European Central Bank");
    expect(await dates("INR")).toEqual(["2026-11-20"]);
    expect(await dates("USD")).toEqual([]);
  });

  it("holds later days back too, and recovers", async () => {
    const later = new Date("2026-11-24T18:00:00Z");
    const days = { ...jump, "2026-11-24": usual };
    await refreshRates(db, { now: later, fetchFn: network({ ecb: () => ecbReply(days) }) });
    expect(await dates("INR")).toEqual(["2026-11-20"]);
    await refreshRates(db, { now: later, fetchFn: network({ ecb: () => ecbReply({ ...twoDays, "2026-11-24": usual }) }) });
    expect(await dates("INR")).toEqual(["2026-11-20", "2026-11-23", "2026-11-24"]);
  });

  it("from the backup is checked against Frankfurter, so it waits while that is down", async () => {
    await refreshRates(db, { now, fetchFn: network({ backup: () => xml(jump) }) });
    expect(await dates("INR")).toEqual(["2026-11-20"]);
  });

  it("is accepted in old history, which nothing can confirm", async () => {
    await db.delete(referenceRates);
    const days = { "2016-06-23": usual, "2016-06-24": { ...usual, GBP: 1.2 } };
    await refreshRates(db, { now, fetchFn: network({ ecb: () => ecbReply(days) }) });
    expect(await dates("GBP")).toEqual(["2016-06-23", "2016-06-24"]);
  });

  it("in the dirham is held back", async () => {
    await seed("2026-11-20", "3.6725", "AED", "USD");
    const fetchFn = network({ ecb: () => ecbReply(twoDays), aed: () => aedReply({ "2026-11-23": 5 }) });
    expect((await refreshRates(db, { now, fetchFn })).failed).toEqual(["Central bank average"]);
    expect(await dates("AED")).toEqual(["2026-11-20"]);
  });
});

describe("how often rates are fetched", () => {
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  it.each([
    ["Monday before publication", "2026-11-23T14:00:00Z", "2026-11-20"],
    ["Monday after publication", "2026-11-23T16:00:00Z", "2026-11-23"],
    ["Saturday", "2026-11-21T20:00:00Z", "2026-11-20"],
    ["Sunday", "2026-11-22T12:00:00Z", "2026-11-20"],
    ["summer time", "2026-07-15T14:45:00Z", "2026-07-15"],
  ])("expects the right day on %s", (_, time, expected) => {
    expect(expectedDate(new Date(time))).toBe(expected);
  });

  it("does nothing when rates are current", async () => {
    await refreshRates(db, { now, fetchFn: healthy() });
    const fetchFn = healthy();
    expect(await refreshIfStale(db, { now, fetchFn })).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("tries at most once in 15 minutes when a source is down", async () => {
    expect(await refreshIfStale(db, { now, fetchFn: network({}) })).not.toBeNull();
    expect(await refreshIfStale(db, { now: at(14), fetchFn: network({}) })).toBeNull();
    expect(await refreshIfStale(db, { now: at(15), fetchFn: network({}) })).not.toBeNull();
  });

  it("lets one of several visitors through", async () => {
    const results = await Promise.all([1, 2, 3].map(() => refreshIfStale(db, { now, fetchFn: healthy() })));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe("access", () => {
  it("lets users read rates but not change them", async () => {
    await seed("2026-11-20");
    expect(await runAsUser(db, alice, (tx) => tx.select().from(referenceRates))).toHaveLength(1);
    await expect(runAsUser(db, alice, (tx) => tx.delete(referenceRates))).rejects.toThrow();
    await expect(runAsUser(db, alice, (tx) => tx.update(referenceRates).set({ rate: "1" }))).rejects.toThrow();
    await expect(
      runAsUser(db, alice, (tx) =>
        tx.insert(referenceRates).values({ currency: "USD", rateDate: "2026-11-20", baseCurrency: "EUR", rate: "1", source: "x" }),
      ),
    ).rejects.toThrow();
    await expect(runAsUser(db, alice, (tx) => tx.select().from(rateRefreshes))).rejects.toThrow();
  });
});
