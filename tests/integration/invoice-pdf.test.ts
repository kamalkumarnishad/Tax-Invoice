import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { invoiceView } from "@/lib/invoice-view";
import { renderInvoicePdf } from "@/server/pdf/invoice";
import type { InvoiceDetail } from "@/server/queries/invoices";

type Change = { invoice?: object; items?: number; paid?: string; seller?: object; buyer?: object; description?: string };

function detail({ invoice, items = 1, paid = "0", seller, buyer, description = "Website design" }: Change = {}) {
  return {
    invoice: {
      id: "1",
      invoiceNumber: "INV/26-27/0001",
      invoiceDate: "2026-11-24",
      dueDate: "2026-12-24",
      currency: "INR",
      taxMode: "cgst_sgst",
      taxRate: "18.00",
      sacCode: "998314",
      placeOfSupply: "Maharashtra",
      subtotal: "100000.0000",
      discount: "1000.0000",
      taxAmount: "17820.0000",
      total: "116820.0000",
      notes: "Thank you",
      status: "issued",
      ...invoice,
    },
    items: Array.from({ length: items }, (_, index) => ({
      id: String(index),
      description,
      quantity: "1.50",
      unitPrice: "66666.6667",
      amount: "100000.0000",
    })),
    payments: [],
    paid,
    seller: {
      name: "आशा Studio",
      address: "1 Test Road\nPune",
      email: "a@example.test",
      phone: null,
      gstin: "27ABCDE1234F1Z5",
      lutArn: "AD2704260000001",
      paymentInstructions: "Bank transfer",
      ...seller,
    },
    buyer: { name: "Zoë", company: "Žižka & Søn", address: "9 Rue", country: "FR", email: null, taxId: null, ...buyer },
    state: "sent",
  } as unknown as InvoiceDetail;
}

describe("invoice view", () => {
  it("shows stored amounts that add up", () => {
    const view = invoiceView(detail());
    expect(view.title).toBe("Tax invoice");
    expect(view.summary).toEqual([
      { label: "Subtotal", value: "₹1,00,000.00" },
      { label: "Discount", value: "−₹1,000.00" },
      { label: "Taxable value", value: "₹99,000.00" },
      { label: "CGST 9%", value: "₹8,910.00" },
      { label: "SGST 9%", value: "₹8,910.00" },
    ]);
    expect(view.total).toBe("₹1,16,820.00");
    expect(view.items[0]).toMatchObject({ quantity: "1.5", unitPrice: "₹66,666.6667" });
    expect(view.details).toEqual(["SAC 998314", "Place of supply: Maharashtra"]);
    expect(view.settled).toBeNull();
  });

  it("shows what is left once something is paid", () => {
    expect(invoiceView(detail({ paid: "16820" })).settled).toEqual({ paid: "₹16,820.00", due: "₹1,00,000.00" });
  });

  it("leaves GST details off an invoice without GST", () => {
    const view = invoiceView(detail({ invoice: { taxMode: "none", taxAmount: "0", total: "99000", discount: "0" } }));
    expect(view.title).toBe("Invoice");
    expect(view.details).toEqual([]);
    expect(view.from.lines.join()).not.toContain("GSTIN");
    expect(view.summary).toHaveLength(1);
  });

  it("states the LUT on an export", () => {
    const view = invoiceView(detail({ invoice: { taxMode: "export_lut", taxAmount: "0" } }));
    expect(view.details.join(" ")).toContain("without payment of integrated tax");
    expect(view.details).toContain("LUT ARN AD2704260000001");
  });
});

describe("invoice PDF", () => {
  const pages = (pdf: Buffer) => pdf.toString("latin1").match(/\/Type \/Page\b/g)?.length;

  it("is a one-page PDF", async () => {
    const pdf = await renderInvoicePdf(invoiceView(detail({ paid: "16820" })));
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, pdf);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(pdf)).toBe(1);
  });

  it("runs on to more pages for a long invoice", async () => {
    const pdf = await renderInvoicePdf(invoiceView(detail({ items: 50 })));
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}.long.pdf`, pdf);
    expect(pages(pdf)).toBeGreaterThan(1);
  });

  it("copes with very long words and odd characters", async () => {
    const description = `${"x".repeat(400)} 日本語 😀 <script>alert(1)</script>`;
    const pdf = await renderInvoicePdf(invoiceView(detail({ description })));
    expect(pages(pdf)).toBe(1);
  });
});
