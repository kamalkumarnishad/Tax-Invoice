import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { referenceRates } from "@/db/schema";
import { displayRate } from "@/lib/cross-rates";
import { compareCurrencies, latestRates, pairHistory, rateOn } from "@/server/services/currency-analyzer/history";
import type { Tx } from "@/server/services/shared";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;

const days: Record<string, Record<string, string>> = {
  "2026-11-19": { INR: "102", USD: "1.1", GBP: "0.84", JPY: "174", AED: "3.6725" },
  "2026-11-20": { INR: "101.85", USD: "1.099", GBP: "0.84", JPY: "174", AED: "3.6725" },
  // The dirham has not arrived yet.
  "2026-11-23": { INR: "101.6395", USD: "1.0939", GBP: "0.83673", JPY: "174.01" },
};
const asAlice = <T>(work: (tx: Tx) => Promise<T>) => runAsUser(db, alice, work);
const on = async (from: string, to: string, date: string) => {
  const point = await asAlice((tx) => rateOn(tx, from, to, date));
  return point && `${displayRate(point.rate)} on ${point.date}`;
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  [alice] = await createUsers(db);
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(referenceRates);
  await db.insert(referenceRates).values(
    Object.entries(days).flatMap(([rateDate, rates]) =>
      Object.entries(rates).map(([currency, rate]) => ({
        currency,
        rateDate,
        rate,
        baseCurrency: currency === "AED" ? "USD" : "EUR",
        source: "test",
      })),
    ),
  );
});

describe("the rate on a date", () => {
  it.each([
    ["USD", "INR", "2026-11-23", "92.9148 on 2026-11-23"],
    ["INR", "USD", "2026-11-23", "0.0107625 on 2026-11-23"],
    ["EUR", "INR", "2026-11-23", "101.64 on 2026-11-23"],
    ["INR", "EUR", "2026-11-23", "0.00983869 on 2026-11-23"],
    ["JPY", "INR", "2026-11-23", "0.584101 on 2026-11-23"],
    ["USD", "AED", "2026-11-20", "3.6725 on 2026-11-20"],
    ["AED", "USD", "2026-11-20", "0.272294 on 2026-11-20"],
    ["AED", "INR", "2026-11-20", "25.2349 on 2026-11-20"],
    ["EUR", "AED", "2026-11-20", "4.03608 on 2026-11-20"],
  ])("%s to %s on %s is %s", async (from, to, date, expected) => {
    expect(await on(from, to, date)).toBe(expected);
  });

  it("is the last working day's at a weekend", async () => {
    expect(await on("USD", "INR", "2026-11-22")).toBe("92.6752 on 2026-11-20");
  });

  it("never mixes a new dollar rate with an old dirham rate", async () => {
    expect(await on("AED", "INR", "2026-11-23")).toBe("25.2349 on 2026-11-20");
  });

  it("is 1 for one currency, even with no rates", async () => {
    await db.delete(referenceRates);
    expect(await on("INR", "INR", "2026-11-23")).toBe("1 on 2026-11-23");
  });

  it.each([
    ["before the first rate", "USD", "2026-11-18"],
    ["too long after the last", "USD", "2026-12-08"],
    ["for a currency without rates", "CAD", "2026-11-23"],
  ])("is missing %s", async (_, from, date) => {
    expect(await on(from, "INR", date)).toBeNull();
  });
});

describe("history", () => {
  it("has each day in the range, oldest first", async () => {
    const points = await asAlice((tx) => pairHistory(tx, "USD", "INR", "2026-11-20", "2026-11-30"));
    expect(points.map(({ date, rate }) => [date, displayRate(rate)])).toEqual([
      ["2026-11-20", "92.6752"],
      ["2026-11-23", "92.9148"],
    ]);
  });

  it("is empty when there is nothing", async () => {
    expect(await asAlice((tx) => pairHistory(tx, "USD", "INR", "2020-01-01", "2020-02-01"))).toEqual([]);
  });
});

describe("latest rates", () => {
  it("are worth in the base currency, with the change", async () => {
    const codes = ["AED", "CAD", "EUR", "INR", "USD"];
    const rows = await asAlice((tx) => latestRates(tx, "INR", codes, "2026-11-24"));
    expect(rows.map((row) => ({ ...row, rate: displayRate(row.rate) }))).toEqual([
      { code: "AED", date: "2026-11-20", rate: "25.2349", change: "-0.06" },
      { code: "EUR", date: "2026-11-23", rate: "101.64", change: "-0.21" },
      { code: "USD", date: "2026-11-23", rate: "92.9148", change: "0.26" },
    ]);
  });

  it("have no change for a first day", async () => {
    const rows = await asAlice((tx) => latestRates(tx, "INR", ["USD"], "2026-11-19"));
    expect(rows).toMatchObject([{ change: null }]);
  });
});

describe("comparison", () => {
  const compare = (codes: string[], start = "2026-11-19") =>
    asAlice((tx) => compareCurrencies(tx, "INR", codes, start, "2026-11-24"));

  it("starts every currency at 100", async () => {
    const result = await compare(["USD", "GBP"]);
    expect(result!.points).toEqual([
      { date: "2026-11-19", values: { USD: "100.00", GBP: "100.00" } },
      { date: "2026-11-20", values: { USD: "99.94", GBP: "99.85" } },
      { date: "2026-11-23", values: { USD: "100.20", GBP: "100.04" } },
    ]);
    expect(result!.rows).toMatchObject([
      { code: "USD", change: "0.20" },
      { code: "GBP", change: "0.04" },
    ]);
  });

  it("uses only days on which all are known", async () => {
    expect((await compare(["USD", "AED"]))!.points.map(({ date }) => date)).toEqual(["2026-11-19", "2026-11-20"]);
  });

  it("is empty when one has no rates", async () => {
    expect(await compare(["USD", "CAD"])).toBeNull();
    expect(await compare(["USD"], "2026-11-24")).toBeNull();
  });
});
