import { CurrencyDisplay } from "@/components/shared/currency-display";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCalendarDate } from "@/lib/dates";
import { isNegative, plain, subtract } from "@/lib/money";
import type { Regime, TaxResult } from "@/server/services/tax-engine/types";
import { regimes } from "@/validations/settings";

const isZero = (amount: string) => plain(amount) === "0";

function Rupees({ amount }: { amount: string }) {
  return <CurrencyDisplay amount={amount} currency="INR" />;
}

function Row({ label, amount, strong, minus }: { label: string; amount: string; strong?: boolean; minus?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 border-t pt-2 font-medium" : "flex justify-between gap-4"}>
      <dt className={strong ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="shrink-0">
        {minus && <span aria-label="minus">−</span>}
        <Rupees amount={amount} />
      </dd>
    </div>
  );
}

function slabLabel(from: string, to: string | null) {
  const rupees = (amount: string) => `₹${BigInt(amount).toLocaleString("en-IN")}`;
  return to ? `${rupees(from)} to ${rupees(to)}` : `Above ${rupees(from)}`;
}

function RegimeCard({ result, lowest }: { result: TaxResult; lowest: boolean }) {
  const refund = isNegative(result.balance);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <h3 className="text-base md:text-base">{regimes[result.regime]}</h3>
          {lowest && <Badge variant="secondary">Lower tax</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 text-sm">
        <div>
          <p className="text-3xl">
            <Rupees amount={result.totalTax} />
          </p>
          <p className="text-muted-foreground">{result.effectiveRate}% of taxable income</p>
        </div>
        <dl className="grid gap-2">
          {!isZero(result.professionalIncome) && <Row label="Professional income" amount={result.professionalIncome} />}
          {!isZero(result.salaryIncome) && (
            <Row label="Salary after standard deduction" amount={result.salaryIncome} />
          )}
          {!isZero(result.interestIncome) && <Row label="Interest" amount={result.interestIncome} />}
          {result.deductions.map((line) => (
            <Row key={line.label} label={line.label} amount={line.amount} minus />
          ))}
          <Row label="Taxable income, rounded to ₹10" amount={result.totalIncome} strong />
        </dl>
        <dl className="grid gap-2">
          {result.slabs
            .filter((slab) => !isZero(slab.income))
            .map((slab) => (
              <Row key={slab.from} label={`${slabLabel(slab.from, slab.to)} at ${slab.rate}%`} amount={slab.tax} />
            ))}
          {!isZero(result.rebate) && <Row label="Rebate, section 156" amount={result.rebate} minus />}
          {!isZero(result.surcharge) && (
            <Row label={`Surcharge at ${result.surchargeRate}%`} amount={result.surcharge} />
          )}
          {!isZero(result.marginalRelief) && (
            <Row label="Marginal relief on surcharge" amount={result.marginalRelief} minus />
          )}
          <Row label="Health and education cess at 4%" amount={result.cess} />
          <Row label="Total tax, rounded to ₹10" amount={result.totalTax} strong />
        </dl>
        <dl className="grid gap-2">
          <Row label="Tax already deducted (TDS)" amount={result.taxDeducted} minus />
          <Row
            label={refund ? "Refund" : "Still to pay"}
            amount={refund ? subtract("0", result.balance) : result.balance}
            strong
          />
        </dl>
        {result.advanceTax.required ? (
          <div className="grid gap-2">
            <p className="font-medium">Advance tax</p>
            <dl className="grid gap-2">
              {result.advanceTax.instalments.map(({ due, amount }) => (
                <Row key={due} label={`By ${formatCalendarDate(due)}`} amount={amount} />
              ))}
            </dl>
            <p className="text-xs text-muted-foreground">
              Payments you have already made are not taken off. Late instalments can carry interest, which is not
              included.
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">No advance tax is due on these figures.</p>
        )}
      </CardContent>
    </Card>
  );
}

type TaxResultsProps = { results: Record<Regime, TaxResult>; reviewed: boolean };

export function TaxResults({ results, reviewed }: TaxResultsProps) {
  const difference = subtract(results.new_regime.totalTax, results.old_regime.totalTax);
  return (
    <section aria-label="Estimate" className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <RegimeCard result={results.new_regime} lowest={isNegative(difference)} />
        <RegimeCard result={results.old_regime} lowest={!isNegative(difference) && !isZero(difference)} />
      </div>
      <ul className="grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
        <li>
          This is an estimate, not tax advice. Have it verified by a qualified professional.
          {!reviewed && " A chartered accountant has not checked these rules yet."}
        </li>
        <li>With professional income, leaving the new regime can be reversed only once.</li>
        <li>Foreign income still to be received converts at SBI&apos;s rate on the last day of the tax year.</li>
        <li>Equipment may have to be depreciated over years instead of deducted at once. That is not worked out here.</li>
        <li>The senior limit for savings interest may also cover bank deposits. Only savings interest is counted here.</li>
      </ul>
    </section>
  );
}
