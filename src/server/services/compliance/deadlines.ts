import { formatMonth, monthsOfTaxYear } from "@/lib/dates";
import { india202627 } from "../tax-engine/jurisdictions/india-2026-27";

export type GstFiling = "monthly" | "quarterly";

/** What decides which deadlines apply. Null fields mean the user has not said. */
export type DeadlineProfile = {
  presumptiveTaxation: boolean;
  hasLut: boolean;
  gstin: string | null;
  gstFiling: GstFiling | null;
};

export type Deadline = {
  /** Never reused for another deadline: users' marks are stored against it. */
  key: string;
  title: string;
  dueDate: string;
  description: string;
  checklist: string[];
};

/**
 * Sources: docs/tax-rules-fy-2026-27.md, sections 7, 8, 10 and 13. "approved"
 * only once a chartered accountant has checked them; until then they are off
 * in production.
 */
export const deadlineRules: { status: "pending_review" | "approved"; taxYear: string; taxYearStart: string } = {
  status: "pending_review",
  taxYear: "IN-2026-27",
  taxYearStart: "2026-04-01",
};

const key = (...parts: string[]) => [deadlineRules.taxYear, ...parts].join(":");

function advanceTax(presumptive: boolean): Deadline[] {
  const { instalments, presumptiveDue } = india202627.advanceTax;
  const description = "Due only if your tax for the year, after TDS, is ₹10,000 or more.";
  const checklist = ["Estimate this year's tax", "Pay on the e-filing portal", "Keep the challan"];
  if (presumptive) {
    return [
      {
        key: key("advance-tax", presumptiveDue),
        title: "Advance tax: full amount",
        dueDate: presumptiveDue,
        description,
        checklist,
      },
    ];
  }
  return instalments.map(({ due, percent }) => ({
    key: key("advance-tax", due),
    title: `Advance tax: ${percent}% in total`,
    dueDate: due,
    description,
    checklist,
  }));
}

/** The day of the month after `month`. */
function nextMonth(month: string, day: number): string {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const next = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
  return `${next}-${day}`;
}

function gstReturns(filing: GstFiling): Deadline[] {
  const months = monthsOfTaxYear(deadlineRules.taxYearStart);
  const sales = ["Check every invoice for the period", "Match payments and credit notes"];

  if (filing === "monthly") {
    return months.flatMap((month) => [
      {
        key: key("gstr1", month),
        title: `GSTR-1 for ${formatMonth(month, "long")}`,
        dueDate: nextMonth(month, 11),
        description: "Monthly return of sales.",
        checklist: sales,
      },
      {
        key: key("gstr3b", month),
        title: `GSTR-3B for ${formatMonth(month, "long")}`,
        dueDate: nextMonth(month, 20),
        description: "Monthly summary return and payment.",
        checklist: ["File GSTR-1 first", "Check input tax credit", "Pay any GST due"],
      },
    ]);
  }

  return [0, 3, 6, 9].flatMap((start) => {
    const [first, second, last] = months.slice(start, start + 3) as [string, string, string];
    const quarter = `${formatMonth(first, "compact")} to ${formatMonth(last, "compact")}`;
    return [
      ...[first, second].map((month) => ({
        key: key("pmt06", month),
        title: `GST payment for ${formatMonth(month, "long")}`,
        dueDate: nextMonth(month, 25),
        description: "Form PMT-06, for quarterly filers. Due only if you owe GST for the month.",
        checklist: ["Work out GST owed", "Pay with PMT-06"],
      })),
      {
        key: key("gstr1", last, "quarter"),
        title: `GSTR-1 for ${quarter}`,
        dueDate: nextMonth(last, 13),
        description: "Quarterly return of sales.",
        checklist: sales,
      },
      {
        key: key("gstr3b", last, "quarter"),
        title: `GSTR-3B for ${quarter}`,
        dueDate: nextMonth(last, 22),
        description: "Quarterly summary return. It is the 24th in some states, so check yours.",
        checklist: ["File GSTR-1 first", "Check input tax credit", "Pay any GST due"],
      },
    ];
  });
}

/** Every deadline for this tax year that applies to the profile, earliest first. */
export function statutoryDeadlines(profile: DeadlineProfile): Deadline[] {
  const deadlines = [
    ...advanceTax(profile.presumptiveTaxation),
    {
      key: key("return"),
      title: "Income tax return for FY 2026-27",
      dueDate: "2027-08-31",
      description: "For a business or profession without an audit. With an audit it is 31 October 2027.",
      checklist: [
        "Income and expense records",
        "Bank statements",
        "TDS certificates",
        "Form 168 from the e-filing portal",
        "Advance tax challans",
        "Proof of deductions, in the old regime",
      ],
    },
    ...(profile.hasLut
      ? [
          {
            key: key("lut"),
            title: "Renew your LUT for FY 2027-28",
            dueDate: "2027-03-31",
            description: "An LUT covers one financial year. File RFD-11 before your first export of the new year.",
            checklist: ["File RFD-11 on the GST portal", "Save the new ARN in your tax profile"],
          },
        ]
      : []),
    ...(profile.gstin && profile.gstFiling ? gstReturns(profile.gstFiling) : []),
  ];
  return deadlines.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.key.localeCompare(b.key));
}
