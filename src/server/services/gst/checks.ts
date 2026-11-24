import { daysBetween, formatCalendarDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { chargesGst, type TaxMode } from "@/lib/invoice";
import { compare, convert } from "@/lib/money";
import { gstRules, registrationLimit } from "./rules";

export type Check = { key: string; level: "warning" | "info"; text: string; href: string | null };

export type CheckedInvoice = {
  id: string;
  number: string;
  status: string;
  invoiceDate: string;
  taxMode: TaxMode;
  sacCode: string | null;
  placeOfSupply: string | null;
  country: string | null;
  fullyPaid: boolean;
};

export type CheckInput = {
  today: string;
  turnover: string;
  state: string | null;
  gstin: string | null;
  gstFiling: string | null;
  hasLut: boolean;
  lutValidTo: string | null;
  invoices: CheckedInvoice[];
};

const TAX_SETTINGS = "/app/settings?tab=tax";

function registration({ turnover, state, gstin }: CheckInput): Check[] {
  if (gstin) return [];
  const limit = registrationLimit(state);
  const amount = formatCurrency(limit, "INR");
  if (compare(turnover, limit) > 0) {
    return [
      {
        key: "registration",
        level: "warning",
        text: `Your turnover is above the ${amount} registration limit. Speak to an accountant about registering.`,
        href: null,
      },
    ];
  }
  if (compare(turnover, convert(limit, gstRules.warnShare, 2)) >= 0) {
    return [
      {
        key: "registration",
        level: "info",
        text: `Your turnover is getting close to the ${amount} registration limit.`,
        href: null,
      },
    ];
  }
  return [];
}

function lut({ today, gstin, hasLut, lutValidTo, invoices }: CheckInput): Check[] {
  if (!gstin) return [];
  if (!hasLut) {
    const exports = invoices.some((invoice) => invoice.taxMode === "export_lut" && invoice.status === "draft");
    return exports
      ? [{ key: "lut", level: "warning", text: "You have a draft export under LUT but no LUT on record.", href: TAX_SETTINGS }]
      : [];
  }
  if (!lutValidTo) return [{ key: "lut", level: "info", text: "Add the date your LUT is valid to.", href: TAX_SETTINGS }];
  const left = daysBetween(today, lutValidTo);
  if (left < 0) {
    return [
      {
        key: "lut",
        level: "warning",
        text: `Your LUT ended on ${formatCalendarDate(lutValidTo)}. File a new one before exporting.`,
        href: TAX_SETTINGS,
      },
    ];
  }
  if (left <= gstRules.lutWarnDays) {
    return [
      { key: "lut", level: "info", text: `Your LUT ends on ${formatCalendarDate(lutValidTo)}.`, href: TAX_SETTINGS },
    ];
  }
  return [];
}

function forInvoice(invoice: CheckedInvoice, { today, gstin }: CheckInput): Check[] {
  const { taxMode, number, country } = invoice;
  const checks: Check[] = [];
  const add = (key: string, text: string, level: Check["level"] = "warning") =>
    checks.push({ key: `${key}:${invoice.id}`, level, text: `${number}: ${text}`, href: `/app/invoices/${invoice.id}` });
  const abroad = country !== null && country !== "IN";

  if (gstin && taxMode === "none" && abroad) {
    add("no-gst-abroad", "the client is abroad and it has no GST. Check whether it should be an export under LUT.", "info");
  }
  if (taxMode === "export_lut" && country === "IN") add("export-in-india", "marked as an export, but the client is in India.");
  if (taxMode === "cgst_sgst" && abroad) add("local-abroad", "charges CGST and SGST, but the client is abroad.");
  if (taxMode !== "none") {
    const missing = [
      ...(invoice.sacCode ? [] : ["SAC code"]),
      ...(invoice.placeOfSupply ? [] : ["place of supply"]),
    ];
    if (missing.length > 0) add("details", `no ${missing.join(" or ")}.`, invoice.status === "draft" ? "info" : "warning");
  }
  if (taxMode === "export_lut" && invoice.status === "issued" && !invoice.fullyPaid) {
    const age = daysBetween(invoice.invoiceDate, today);
    if (age > gstRules.exportPaymentDays) {
      add("export-unpaid", "an export under LUT still unpaid after a year. GST may be due, so ask an accountant.");
    } else if (age >= gstRules.exportWarnDays) {
      add("export-unpaid", "an export under LUT, unpaid for almost a year. Payment is expected within one year.", "info");
    }
  }
  if (chargesGst(taxMode) && !gstin) add("no-gstin", "charges GST, but there is no GSTIN in your tax profile.");
  return checks;
}

/** Things to look at, warnings first. None of them decides anything for the user. */
export function gstChecks(input: CheckInput): Check[] {
  const checks = [
    ...registration(input),
    ...(input.gstin && !input.gstFiling
      ? [
          {
            key: "filing",
            level: "info" as const,
            text: "Choose how often you file GST returns, so the dates appear in your calendar.",
            href: TAX_SETTINGS,
          },
        ]
      : []),
    ...lut(input),
    ...input.invoices.flatMap((invoice) => forInvoice(invoice, input)),
  ];
  return checks.sort((a, b) => Number(a.level === "info") - Number(b.level === "info"));
}
