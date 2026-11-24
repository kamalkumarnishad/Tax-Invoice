import { describe, expect, it } from "vitest";
import { crossRate, displayRate, indexed, percentChange, stepFor, summarise, thin } from "@/lib/cross-rates";
import { convert } from "@/lib/money";
import { monthsBefore, parseAnalyzer } from "@/validations/currency-analyzer";

describe("cross rates", () => {
  // ECB figures for 23 November 2026.
  it.each([
    ["1.0939", "101.6395", "92.9148"],
    ["174.01", "101.6395", "0.584101"],
    ["0.83673", "101.6395", "121.472"],
    ["1", "101.6395", "101.64"],
    ["101.6395", "1", "0.00983869"],
  ])("from %s and %s is %s", (from, to, shown) => {
    expect(displayRate(crossRate(from, to))).toBe(shown);
  });

  it("converts with the full rate, not the one shown", () => {
    expect(convert("10000", crossRate("1.0939", "101.6395"), 2)).toBe("929148.00");
    expect(convert("1000000000", crossRate("1.0939", "101.6395"), 2)).toBe("92914800255.96");
    expect(convert("1000", crossRate("101.6395", "174.01"), 0)).toBe("1712");
  });

  it("comes back to the same amount", () => {
    const there = convert("1234.56", crossRate("1.0939", "101.6395"), 8);
    expect(convert(there, crossRate("101.6395", "1.0939"), 2)).toBe("1234.56");
  });

  it.each([
    ["100", "101.255", "1.26"],
    ["100", "98.75", "-1.25"],
    ["100", "100.001", "0.00"],
    ["100", "99.999", "0.00"],
  ])("the change from %s to %s is %s%%", (before, after, change) => {
    expect(percentChange(before, after)).toBe(change);
  });

  it("starts an index at 100", () => {
    expect([indexed("92.5", "92.5"), indexed("80", "84")]).toEqual(["100.00", "105.00"]);
  });
});

describe("summary", () => {
  const point = (date: string, rate: string) => ({ date, rate });

  it("finds the high, low, average and change", () => {
    const points = [point("2026-01-01", "90"), point("2026-01-02", "95"), point("2026-01-05", "88"), point("2026-01-06", "91")];
    expect(summarise(points)).toEqual({
      first: points[0],
      last: points[3],
      high: points[1],
      low: points[2],
      average: "91",
      change: "1.11",
      days: 4,
    });
  });

  it("gives the first day of an equal high", () => {
    const points = [point("2026-01-01", "9"), point("2026-01-02", "9.0")];
    expect(summarise(points)!.high.date).toBe("2026-01-01");
  });

  it("is empty without points", () => expect(summarise([])).toBeNull());
});

describe("thinning", () => {
  const days = (...dates: string[]) => dates.map((date) => ({ date }));
  const dates = (list: { date: string }[]) => list.map(({ date }) => date);

  it.each([
    ["2026-10-24", "2026-11-24", "day"],
    ["2025-11-24", "2026-11-24", "day"],
    ["2021-11-24", "2026-11-24", "week"],
    ["2016-11-24", "2026-11-24", "month"],
  ])("%s to %s is by %s", (start, end, step) => {
    expect(stepFor(start, end)).toBe(step);
  });

  it("keeps the first day, then the last of each week", () => {
    const list = days("2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24");
    expect(dates(thin(list, "week"))).toEqual(["2026-11-18", "2026-11-20", "2026-11-24"]);
  });

  it("keeps the last day of each month", () => {
    const list = days("2026-09-29", "2026-09-30", "2026-10-01", "2026-10-30", "2026-11-02", "2026-11-03");
    expect(dates(thin(list, "month"))).toEqual(["2026-09-29", "2026-09-30", "2026-10-30", "2026-11-03"]);
  });

  it("keeps every day of a short range", () => {
    const list = days("2026-11-23", "2026-11-24");
    expect(thin(list, "day")).toEqual(list);
  });
});

describe("what an address asks for", () => {
  const codes = ["AED", "AUD", "CAD", "EUR", "GBP", "INR", "JPY", "SGD", "USD"];
  const parse = (raw: Parameters<typeof parseAnalyzer>[0], base = "INR") =>
    parseAnalyzer(raw, { today: "2026-11-24", base, codes });

  it.each([
    ["2026-11-24", 1, "2026-10-24"],
    ["2026-03-31", 1, "2026-02-28"],
    ["2028-03-31", 1, "2028-02-29"],
    ["2026-01-15", 3, "2025-10-15"],
    ["2026-11-24", 120, "2016-11-24"],
    ["2028-02-29", 12, "2027-02-28"],
  ])("%s less %i months is %s", (date, months, expected) => {
    expect(monthsBefore(date, months)).toBe(expected);
  });

  it("has defaults", () => {
    expect(parse({})).toEqual({
      from: "USD",
      to: "INR",
      compared: ["USD", "EUR", "GBP"],
      tooMany: false,
      range: "1y",
      start: "2025-11-24",
      end: "2026-11-24",
    });
    expect(parse({}, "USD")).toMatchObject({ from: "EUR", to: "USD", compared: ["EUR", "GBP"] });
  });

  it("takes currencies and a range", () => {
    expect(parse({ from: "GBP", to: "AED", with: ["JPY", "AED"], range: "5y" })).toMatchObject({
      from: "GBP",
      to: "AED",
      compared: ["AED", "JPY"],
      start: "2021-11-24",
    });
  });

  it.each([
    [{ from: "XXX", to: "<script>" }, { from: "USD", to: "INR" }],
    [{ from: "INR", to: "INR" }, { from: "USD", to: "INR" }],
    [{ to: "USD" }, { from: "EUR", to: "USD" }],
    [{ with: "INR" }, { compared: ["USD", "EUR", "GBP"] }],
    [{ with: ["AED", "AUD", "CAD", "EUR", "GBP"] }, { compared: ["AED", "AUD", "CAD", "EUR"], tooMany: true }],
    [{ range: "constructor" }, { range: "1y" }],
    [{ range: ["3m", "1m"] }, { range: "3m" }],
  ])("%j becomes %j", (raw, expected) => {
    expect(parse(raw)).toMatchObject(expected);
  });

  it("takes two dates", () => {
    expect(parse({ start: "2016-01-01", end: "2026-11-24" })).toMatchObject({ range: "", start: "2016-01-01" });
  });

  it.each([
    [{ start: "2026-01-01" }, "Enter two valid dates."],
    [{ start: "2026-02-30", end: "2026-03-01" }, "Enter two valid dates."],
    [{ start: "2015-12-31", end: "2026-01-01" }, "Rates start on 1 January 2016."],
    [{ start: "2026-01-01", end: "2026-11-25" }, "The end date is in the future."],
    [{ start: "2026-01-01", end: "2026-01-01" }, "The end date must be after the start date."],
  ])("refuses %j", (raw, error) => {
    expect(parse(raw)).toMatchObject({ error, range: "1y", start: "2025-11-24" });
  });
});
