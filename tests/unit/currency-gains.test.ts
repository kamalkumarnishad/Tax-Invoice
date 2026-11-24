import { describe, expect, it } from "vitest";
import { looksLookedUp, paymentBreakdown, sumBreakdowns, unpaidMovement } from "@/lib/currency-gains";
import { add, compare, convert, subtract } from "@/lib/money";

/** ECB figures for 23 November 2026: 101.6395 / 1.0939. */
const PAID_RATE = "92.914800255964896243";

const example = {
  amount: "2000",
  invoiceRate: "96.825",
  paymentRate: PAID_RATE,
  converted: "184200",
  netReceived: "181858",
  tds: "0",
  decimals: 2,
};

describe("a payment's breakdown", () => {
  it("is the example in the plan", () => {
    expect(paymentBreakdown(example)).toEqual({
      start: "193650.00",
      movement: "-7820.4",
      margin: "-1629.6",
      fees: "2342",
      tds: "0",
      received: "181858",
    });
  });

  it("shows a gain when the rate rose", () => {
    expect(paymentBreakdown({ ...example, invoiceRate: "90" }).movement).toBe("5829.6");
  });

  it("shows a better rate than the reference as a gain", () => {
    expect(paymentBreakdown({ ...example, converted: "186000" }).margin).toBe("170.4");
  });

  it("starts at the payment when there is no earlier date", () => {
    expect(paymentBreakdown({ ...example, invoiceRate: null })).toMatchObject({ start: "185829.60", movement: null });
  });

  it("keeps TDS apart from fees", () => {
    expect(paymentBreakdown({ ...example, netReceived: "163438", tds: "18420" })).toMatchObject({
      fees: "2342",
      tds: "18420",
    });
  });

  it("uses whole yen", () => {
    const yen = { ...example, amount: "10", invoiceRate: "150.55", paymentRate: "151.26", converted: "1510", netReceived: "1500", decimals: 0 };
    expect(paymentBreakdown(yen)).toMatchObject({ start: "1506", movement: "7", margin: "-3", fees: "10" });
  });

  it("always adds up, whatever the figures", () => {
    // A fixed sequence, so a failure can be repeated.
    let seed = 20261124;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 2000; i++) {
      const decimals = i % 3 === 0 ? 0 : 2;
      const amount = (random() * 1e6 + 0.01).toFixed(4);
      const recorded = (random() * 200 + 0.001).toFixed(8);
      const converted = convert(amount, recorded, decimals);
      const fees = convert(converted, (random() * 0.1).toFixed(6), 4);
      const tds = convert(converted, (random() * 0.1).toFixed(6), 4);
      const result = paymentBreakdown({
        amount,
        invoiceRate: i % 5 === 0 ? null : (random() * 200 + 0.001).toFixed(17),
        paymentRate: (random() * 200 + 0.001).toFixed(17),
        converted,
        netReceived: subtract(converted, fees, tds),
        tds,
        decimals,
      });
      const end = subtract(add(result.start, result.movement ?? "0", result.margin), result.fees, result.tds);
      expect(compare(end, result.received)).toBe(0);
      expect(compare(result.fees, fees)).toBe(0);
    }
  });
});

describe("a rate that was probably looked up", () => {
  it.each([
    ["92.92", true],
    ["92.9148", true],
    ["92.93", true],
    ["92.94", false],
    ["92.10", false],
  ])("%s against 92.9148 is %s", (recorded, expected) => {
    expect(looksLookedUp(recorded, PAID_RATE)).toBe(expected);
  });
});

describe("an unpaid amount", () => {
  it("is compared with the rate now", () => {
    expect(unpaidMovement("100", "90", "92.5", 2)).toEqual({ start: "9000.00", now: "9250.00", movement: "250" });
  });
});

describe("totals", () => {
  it("add up each part", () => {
    const rows = [paymentBreakdown(example), paymentBreakdown({ ...example, invoiceRate: null })];
    expect(sumBreakdowns(rows)).toEqual({
      movement: "-7820.4",
      margin: "-3259.2",
      fees: "4684",
      tds: "0",
      received: "363716",
    });
  });

  it("are zero for nothing", () => {
    expect(sumBreakdowns([])).toEqual({ movement: "0", margin: "0", fees: "0", tds: "0", received: "0" });
  });
});
