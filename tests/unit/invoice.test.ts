import { describe, expect, it } from "vitest";
import { invoiceState, invoiceTotals, nextInvoiceNumber, type TaxMode } from "@/lib/invoice";
import { type InvoiceFormValues, invoiceSchema } from "@/validations/invoices";

const totals = (
  items: [string, string][],
  { discount = "0", taxMode = "none", taxRate = "0", decimals = 2 }: Partial<{ discount: string; taxMode: TaxMode; taxRate: string; decimals: number }> = {},
) =>
  invoiceTotals({
    items: items.map(([quantity, unitPrice]) => ({ quantity, unitPrice })),
    discount,
    taxMode,
    taxRate,
    decimals,
  });

describe("invoice totals", () => {
  it("adds lines that were each rounded", () => {
    expect(totals([["1.5", "33.333"], ["3", "0.1"]])).toMatchObject({
      amounts: ["50.00", "0.30"],
      subtotal: "50.30",
      total: "50.30",
      taxes: [],
    });
  });

  it("charges IGST after the discount", () => {
    expect(totals([["1", "1000"]], { discount: "100", taxMode: "igst", taxRate: "18" })).toMatchObject({
      taxable: "900.00",
      taxes: [{ label: "IGST 18%", amount: "162.00" }],
      taxAmount: "162.00",
      total: "1062.00",
    });
  });

  it("splits CGST and SGST and rounds each half", () => {
    // 9% of 100.06 is 9.0054
    expect(totals([["1", "100.06"]], { taxMode: "cgst_sgst", taxRate: "18" })).toMatchObject({
      taxes: [
        { label: "CGST 9%", amount: "9.01" },
        { label: "SGST 9%", amount: "9.01" },
      ],
      taxAmount: "18.02",
      total: "118.08",
    });
    expect(totals([["1", "100"]], { taxMode: "cgst_sgst", taxRate: "5" }).taxes[0]!.label).toBe("CGST 2.5%");
  });

  it.each(["none", "export_lut"] as const)("charges nothing for %s, whatever the rate says", (taxMode) => {
    expect(totals([["1", "100"]], { taxMode, taxRate: "18" })).toMatchObject({ taxAmount: "0.00", total: "100.00" });
  });

  it("uses the currency's own decimals", () => {
    expect(totals([["3", "33.5"]], { decimals: 0 })).toMatchObject({ amounts: ["101"], total: "101" });
  });
});

describe("invoice state", () => {
  const base = { status: "issued", total: "100.0000", paid: "0", dueDate: "2026-11-30", today: "2026-11-24" };
  it.each([
    [{}, "sent"],
    [{ today: "2026-11-30" }, "sent"],
    [{ today: "2026-12-01" }, "overdue"],
    [{ paid: "40" }, "partially_paid"],
    [{ paid: "40", today: "2026-12-01" }, "overdue"],
    [{ paid: "100", today: "2026-12-01" }, "paid"],
    [{ status: "draft", today: "2026-12-01" }, "draft"],
    [{ status: "cancelled" }, "cancelled"],
  ])("%j is %s", (change, expected) => {
    expect(invoiceState({ ...base, ...change })).toBe(expected);
  });
});

describe("invoice numbers", () => {
  it("start at 1 and follow the highest in the same tax year", () => {
    expect(nextInvoiceNumber("2026-04-01", [])).toBe("INV/26-27/0001");
    expect(nextInvoiceNumber("2026-04-01", ["INV/26-27/0009", "INV/26-27/0002", "INV/25-26/0090", "X-12"])).toBe(
      "INV/26-27/0010",
    );
  });

  it("stay within 16 characters up to 999,999 invoices a year", () => {
    expect(nextInvoiceNumber("2026-04-01", ["INV/26-27/999998"])).toBe("INV/26-27/999999");
    expect("INV/26-27/999999").toHaveLength(16);
  });

  it("carry over the century", () => {
    expect(nextInvoiceNumber("2099-04-01", [])).toBe("INV/99-00/0001");
  });

  it("ignore odd endings", () => {
    expect(nextInvoiceNumber("2026-04-01", ["INV/26-27/", "INV/26-27/12A"])).toBe("INV/26-27/0001");
  });
});

describe("invoice input", () => {
  const valid: InvoiceFormValues = {
    clientId: "3f0c2f0e-6b1b-4f43-9d0a-6f1d4a9c1a11",
    invoiceNumber: "INV/26-27/0001",
    invoiceDate: "2026-11-24",
    dueDate: "2026-12-24",
    currency: "INR",
    taxMode: "none",
    taxRate: "",
    sacCode: "998314",
    placeOfSupply: "",
    discount: "",
    items: [{ description: "Design", quantity: "1", unitPrice: "1,000" }],
    notes: "",
  };

  it("accepts a plain invoice", () => {
    expect(invoiceSchema.parse(valid)).toMatchObject({ taxRate: "0", discount: "0", items: [{ unitPrice: "1000" }] });
  });

  it.each([
    [{ clientId: "" }, ["clientId"]],
    [{ invoiceNumber: "INV 1" }, ["invoiceNumber"]],
    [{ invoiceNumber: "12345678901234567" }, ["invoiceNumber"]],
    [{ dueDate: "2026-11-23" }, ["dueDate"]],
    [{ taxMode: "igst", taxRate: "" }, ["taxRate"]],
    [{ taxRate: "101" }, ["taxRate"]],
    [{ sacCode: "99" }, ["sacCode"]],
    [{ items: [] }, ["items"]],
    [{ items: [{ description: "x", quantity: "0", unitPrice: "1" }] }, ["items", 0, "quantity"]],
    [{ items: [{ description: "", quantity: "1", unitPrice: "1" }] }, ["items", 0, "description"]],
    [{ items: [{ description: "x", quantity: "1", unitPrice: "-1" }] }, ["items", 0, "unitPrice"]],
  ])("rejects %j", (change, path) => {
    const result = invoiceSchema.safeParse({ ...valid, ...change });
    expect(result.error?.issues[0]?.path).toEqual(path);
  });
});
