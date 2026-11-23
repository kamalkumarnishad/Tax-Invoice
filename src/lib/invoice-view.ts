import "server-only";
import type { InvoiceDetail } from "@/server/queries/invoices";
import { countryName } from "./country-names";
import { formatCalendarDate } from "./dates";
import { formatCurrency } from "./format";
import type { TaxMode } from "./invoice";
import { half, isZero, plain, subtract } from "./money";

const lines = (...values: (string | null | undefined)[]) =>
  values.flatMap((value) => (value ? value.split(/\r?\n/) : [])).filter((line) => line.trim() !== "");

/** Everything an invoice shows, as text, so the page and the PDF cannot disagree. */
export function invoiceView({ invoice, items, paid, seller, buyer, state }: InvoiceDetail) {
  const mode = invoice.taxMode as TaxMode;
  const show = (amount: string) => formatCurrency(amount, invoice.currency);
  const rate = plain(invoice.taxRate);
  // From the stored amount. CGST and SGST are always equal halves of it.
  const taxes =
    mode === "igst"
      ? [{ label: `IGST ${rate}%`, amount: invoice.taxAmount }]
      : mode === "cgst_sgst"
        ? ["CGST", "SGST"].map((name) => ({ label: `${name} ${half(rate)}%`, amount: half(invoice.taxAmount) }))
        : [];
  const taxable = subtract(invoice.subtotal, invoice.discount);

  return {
    title: mode === "igst" || mode === "cgst_sgst" ? "Tax invoice" : "Invoice",
    number: invoice.invoiceNumber,
    watermark: state === "draft" ? "Draft" : state === "cancelled" ? "Cancelled" : null,
    dates: [
      { label: "Invoice date", value: formatCalendarDate(invoice.invoiceDate) },
      { label: "Due date", value: formatCalendarDate(invoice.dueDate) },
    ],
    from: {
      name: seller?.name ?? "Add your business details in Settings",
      lines: lines(
        seller?.address,
        seller?.email,
        seller?.phone,
        mode !== "none" && seller?.gstin ? `GSTIN ${seller.gstin}` : null,
      ),
    },
    to: {
      name: buyer?.company ?? buyer?.name ?? "",
      lines: lines(
        buyer?.company ? buyer.name : null,
        buyer?.address,
        buyer?.country ? countryName(buyer.country) : null,
        buyer?.email,
        buyer?.taxId ? `Tax ID ${buyer.taxId}` : null,
      ),
    },
    items: items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: plain(item.quantity),
      unitPrice: formatCurrency(item.unitPrice, invoice.currency, "en-IN", 4),
      amount: show(item.amount),
    })),
    summary: [
      { label: "Subtotal", value: show(invoice.subtotal) },
      ...(isZero(invoice.discount)
        ? []
        : [
            { label: "Discount", value: `−${show(invoice.discount)}` },
            { label: "Taxable value", value: show(taxable) },
          ]),
      ...taxes.map((tax) => ({ label: tax.label, value: show(tax.amount) })),
    ],
    total: show(invoice.total),
    settled: isZero(paid)
      ? null
      : { paid: show(paid), due: show(subtract(invoice.total, paid)) },
    details: [
      ...(mode !== "none" && invoice.sacCode ? [`SAC ${invoice.sacCode}`] : []),
      ...(mode !== "none" && invoice.placeOfSupply ? [`Place of supply: ${invoice.placeOfSupply}`] : []),
      ...(mode === "export_lut"
        ? [
            "Supply meant for export under Letter of Undertaking without payment of integrated tax.",
            ...(seller?.lutArn ? [`LUT ARN ${seller.lutArn}`] : []),
          ]
        : []),
    ],
    payment: lines(seller?.paymentInstructions),
    notes: lines(invoice.notes),
  };
}

export type InvoiceView = ReturnType<typeof invoiceView>;
