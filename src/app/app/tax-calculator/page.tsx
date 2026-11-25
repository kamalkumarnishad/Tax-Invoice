import { Calculator } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layouts/page-header";
import { CurrencyDisplay } from "@/components/shared/currency-display";
import { EmptyState } from "@/components/shared/empty-state";
import { TaxForm } from "@/components/tax/tax-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { plain } from "@/lib/money";
import { getTaxProfile, getUserSettings } from "@/server/queries/settings";
import { listCalculations } from "@/server/queries/tax";
import { prefill } from "@/server/services/tax";
import { calculatorAvailable, currentRules } from "@/server/services/tax-engine/rules";
import type { AgeGroup } from "@/server/services/tax-engine/types";

export const metadata: Metadata = { title: "Tax calculator" };

const blankIfZero = (amount: string) => (plain(amount) === "0" ? "" : plain(amount));

export default async function TaxCalculatorPage() {
  const user = await requireUser();

  if (!calculatorAvailable()) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageHeader title="Tax calculator" description={currentRules.label} />
        <EmptyState
          icon={Calculator}
          title="The tax rules are being reviewed"
          description="The calculator will open once a chartered accountant has checked the rules for this year."
        />
      </div>
    );
  }

  const [figures, profile, saved, settings] = await Promise.all([
    withUser(user.id, (tx) => prefill(tx, user.id, currentRules.taxYearStart)),
    getTaxProfile(user.id),
    listCalculations(user.id),
    getUserSettings(user.id),
  ]);

  const reviewed = currentRules.status === "approved";

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader title="Tax calculator" description={`${currentRules.label}. Both regimes are compared.`} />
      {!reviewed && (
        <Alert>
          <AlertTitle>For testing only</AlertTitle>
          <AlertDescription>
            A chartered accountant has not checked these rules yet. This page is switched off in production until then.
          </AlertDescription>
        </Alert>
      )}
      {(plain(figures.unplacedIncome) !== "0" || figures.otherCurrencyRecords > 0) && (
        <Alert>
          <AlertTitle>Not everything is filled in</AlertTitle>
          <AlertDescription>
            {plain(figures.unplacedIncome) !== "0" && (
              <p>
                {formatCurrency(figures.unplacedIncome, "INR")} of royalty and other income is left out. Add it where it
                belongs.
              </p>
            )}
            {figures.otherCurrencyRecords > 0 && (
              <p>Records kept in a currency other than INR are left out: {figures.otherCurrencyRecords}.</p>
            )}
          </AlertDescription>
        </Alert>
      )}
      <TaxForm
        reviewed={reviewed}
        values={{
          ageGroup: (profile?.ageGroup ?? "under_60") as AgeGroup,
          receipts: blankIfZero(figures.receipts),
          method: profile?.presumptiveTaxation ? "presumptive" : "actual",
          expenses: blankIfZero(figures.expenses),
          cashReceipts: blankIfZero(figures.cashReceipts),
          declaredProfit: "",
          professionConfirmed: false,
          salary: "",
          savingsInterest: "",
          otherInterest: blankIfZero(figures.interest),
          interestIsOwn: false,
          savings: "",
          nps: "",
          healthSelf: "",
          healthParents: "",
          parentsSenior: false,
          taxDeducted: blankIfZero(figures.taxDeducted),
          scopeConfirmed: false,
        }}
      />
      {saved.length > 0 && (
        <section className="grid grid-cols-1 gap-3">
          <h2 className="text-lg md:text-xl">Saved calculations</h2>
          <ul className="divide-y rounded-lg border">
            {saved.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <Link
                  href={`/app/tax-calculator/${row.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {formatDate(row.createdAt, "en-IN", settings?.timezone)}
                </Link>
                <span className="text-muted-foreground">
                  New <CurrencyDisplay amount={row.results.new_regime.totalTax} currency="INR" /> · Old{" "}
                  <CurrencyDisplay amount={row.results.old_regime.totalTax} currency="INR" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
