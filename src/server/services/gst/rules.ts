/**
 * Sources: docs/tax-rules-fy-2026-27.md, section 10. "approved" only once a
 * chartered accountant has checked them; until then they are off in production.
 */
export const gstRules: {
  status: "pending_review" | "approved";
  taxYearStart: string;
  registrationLimit: string;
  lowLimit: string;
  lowLimitStates: readonly string[];
  /** Share of the limit at which to start warning. */
  warnShare: string;
  /** Payment for an export under LUT is expected within a year of its invoice. */
  exportPaymentDays: number;
  exportWarnDays: number;
  lutWarnDays: number;
} = {
  status: "pending_review",
  taxYearStart: "2026-04-01",
  registrationLimit: "2000000",
  lowLimit: "1000000",
  lowLimitStates: ["Manipur", "Mizoram", "Nagaland", "Tripura"],
  warnShare: "0.8",
  exportPaymentDays: 365,
  exportWarnDays: 305,
  lutWarnDays: 30,
};

export function registrationLimit(state: string | null): string {
  return state && gstRules.lowLimitStates.includes(state) ? gstRules.lowLimit : gstRules.registrationLimit;
}
