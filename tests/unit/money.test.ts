import { describe, expect, it } from "vitest";
import { taxYearEnd, taxYearLabel, taxYearStartFor, todayIn } from "@/lib/dates";
import { add, convert, isNegative, plain, roundRate, subtract } from "@/lib/money";

describe("money", () => {
  it("adds without floating-point error", () => {
    expect(add("0.1", "0.2")).toBe("0.3");
    expect(add()).toBe("0");
  });

  it("subtracts several amounts", () => {
    expect(subtract("100", "0.1", "0.2")).toBe("99.7");
    expect(isNegative(subtract("1", "2"))).toBe(true);
    expect(isNegative("0")).toBe(false);
  });

  it.each([
    ["100", "92.68", 2, "9268.00"],
    ["1.005", "1", 2, "1.01"],
    ["2.675", "1", 2, "2.68"],
    ["0.005", "1", 2, "0.01"],
    ["1234.5", "0.66666667", 0, "823"],
    ["999999999999999.9999", "1.00000001", 4, "1000000009999999.9999"],
  ])("converts %s at %s to %i places", (amount, rate, places, expected) => {
    expect(convert(amount, rate, places)).toBe(expected);
  });

  it("formats rates and plain amounts", () => {
    expect(roundRate(0.0107898)).toBe("0.01078980");
    expect(plain("100.0000")).toBe("100");
    expect(plain("0.5000")).toBe("0.5");
  });
});

describe("dates", () => {
  it.each([
    ["2026-04-01", "2026-04-01"],
    ["2026-12-31", "2026-04-01"],
    ["2027-03-31", "2026-04-01"],
    ["2027-04-01", "2027-04-01"],
    ["2028-02-29", "2027-04-01"],
  ])("puts %s in the year starting %s", (date, start) => {
    expect(taxYearStartFor(date)).toBe(start);
  });

  it("labels and ends a year", () => {
    expect(taxYearLabel("2026-04-01")).toBe("FY 2026-27");
    expect(taxYearLabel("1999-04-01")).toBe("FY 1999-00");
    expect(taxYearEnd("2026-04-01")).toBe("2027-03-31");
  });

  it("uses the user's own day", () => {
    const lateEvening = new Date("2026-03-31T20:00:00Z");
    expect(todayIn("Asia/Kolkata", lateEvening)).toBe("2026-04-01");
    expect(todayIn("America/New_York", lateEvening)).toBe("2026-03-31");
  });
});
