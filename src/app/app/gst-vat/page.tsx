import { Download, Landmark } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CheckList } from "@/components/gst/check-list";
import { SalesTable } from "@/components/gst/sales-table";
import { PageHeader } from "@/components/layouts/page-header";
import { CurrencyDisplay } from "@/components/shared/currency-display";
import { EmptyState } from "@/components/shared/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatCalendarDate, taxYearLabel } from "@/lib/dates";
import { withUser } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { isZero } from "@/lib/money";
import { getUserDefaults } from "@/server/queries/settings";
import { gstRules } from "@/server/services/gst/rules";
import { gstSummary } from "@/server/services/gst/summary";

export const metadata: Metadata = { title: "GST" };

const link = "text-foreground underline underline-offset-4";

function Line({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 border-t pt-2 font-medium" : "flex justify-between gap-4"}>
      <dt className={strong ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

export default async function GstPage() {
  const user = await requireUser();
  const { today } = await getUserDefaults(user.id);
  const summary = await withUser(user.id, (tx) => gstSummary(tx, { userId: user.id, today }));
  const { turnover, lut, range } = summary;
  const rupees = (amount: string) => <CurrencyDisplay amount={amount} currency="INR" />;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title="GST"
        description={`${taxYearLabel(range.from)}, from your invoices and income`}
        action={
          <Button asChild variant="outline">
            {/* Not a Link: prefetching would run and log an export nobody asked for. */}
            <a href={`/app/reports/export?kind=invoices&from=${range.from}&to=${range.to}`} download>
              <Download /> Invoices CSV
            </a>
          </Button>
        }
      />
      <Alert>
        <AlertTitle>{summary.reviewed ? "A guide, not advice" : "Some guidance is being reviewed"}</AlertTitle>
        <AlertDescription>
          {summary.reviewed ? (
            <p>
              This page does not decide whether you must register or what you owe.
              {gstRules.status !== "approved" && " A chartered accountant has not checked these rules yet."}
            </p>
          ) : (
            <p>
              The registration limit and the checks will appear once a chartered accountant has checked them. The
              figures below come from your own records.
            </p>
          )}
        </AlertDescription>
      </Alert>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base md:text-base">Turnover this year</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <dl className="grid gap-2">
              <Line label="Invoices, before GST">{rupees(turnover.invoiced)}</Line>
              <Line label="Income without an invoice">{rupees(turnover.direct)}</Line>
              <Line label="Total" strong>
                {rupees(turnover.total)}
              </Line>
              {summary.limit && <Line label="Registration limit">{rupees(summary.limit)}</Line>}
            </dl>
            <div className="grid gap-2 text-muted-foreground">
              {turnover.foreignUnpaid.length > 0 && (
                <p>
                  Not counted until paid:{" "}
                  {turnover.foreignUnpaid.map((row) => formatCurrency(row.total, row.currency)).join(", ")} in foreign
                  currency invoices.
                </p>
              )}
              {!isZero(turnover.interest) && <p>Interest of {formatCurrency(turnover.interest, "INR")} is left out.</p>}
              {turnover.otherCurrencyRecords > 0 && (
                <p>Records in another default currency are not included: {turnover.otherCurrencyRecords}.</p>
              )}
              {summary.limit && !summary.state && (
                <p>
                  The limit is {formatCurrency(gstRules.lowLimit, "INR")} in {gstRules.lowLimitStates.join(", ")}.{" "}
                  <Link href="/app/settings?tab=business" className={link}>
                    Add your state
                  </Link>
                  .
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base md:text-base">Registration and LUT</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <dl className="grid gap-2">
              <Line label="GSTIN">{summary.gstin ?? "Not added"}</Line>
              <Line label="State">{summary.state ?? "Not added"}</Line>
              <Line label="LUT">{lut ? (lut.arn ?? "Added, no ARN") : "Not added"}</Line>
              {lut?.to && <Line label="LUT valid to">{formatCalendarDate(lut.to)}</Line>}
            </dl>
            <Link href="/app/settings?tab=tax" className={`w-fit ${link}`}>
              Edit tax profile
            </Link>
          </CardContent>
        </Card>
      </div>
      {summary.reviewed && (
        <section className="grid grid-cols-1 gap-3">
          <h2 className="text-lg md:text-xl">Things to check</h2>
          <CheckList checks={summary.checks} />
        </section>
      )}
      <section className="grid grid-cols-1 gap-3">
        <h2 className="text-lg md:text-xl">Issued invoices by month</h2>
        {summary.sales.length === 0 ? (
          <EmptyState icon={Landmark} title="No invoices issued" description="Issued invoices from this year appear here." />
        ) : (
          <>
            <div className="rounded-lg border">
              <SalesTable sales={summary.sales} />
            </div>
            <p className="text-sm text-muted-foreground">
              By invoice date. Drafts and cancelled invoices are left out, and so is GST you paid on purchases.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
