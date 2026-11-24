import { Coins } from "lucide-react";
import type { Metadata } from "next";
import { after } from "next/server";
import { Calculator } from "@/components/currency-analyzer/calculator";
import { Compare } from "@/components/currency-analyzer/compare";
import { LatestTable } from "@/components/currency-analyzer/latest-table";
import { RangeControls } from "@/components/currency-analyzer/range-controls";
import { Trend } from "@/components/currency-analyzer/trend";
import { PageHeader } from "@/components/layouts/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { daysBetween, formatCalendarDate } from "@/lib/dates";
import { getDb } from "@/lib/db";
import { getAnalyzer } from "@/server/queries/currency-analyzer";
import { refreshIfStale } from "@/server/services/currency-analyzer/refresh";
import { FIRST_DAY } from "@/validations/currency-analyzer";

export const metadata: Metadata = { title: "Currency analyzer" };
// The first visit of all may load ten years of rates after the page is sent.
export const maxDuration = 120;

/** Easter is the longest time without a new rate. */
const STALE_DAYS = 5;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base md:text-base">{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Runs once the page has been sent, so a slow or failing source never holds it up. */
async function refreshInBackground() {
  try {
    await refreshIfStale(await getDb(), { now: new Date() });
  } catch (error) {
    console.error("Refreshing reference rates failed:", error instanceof Error ? error.message : "unknown error");
  }
}

export default async function CurrencyAnalyzerPage({ searchParams }: Props) {
  const user = await requireUser();
  const analyzer = await getAnalyzer(user.id, await searchParams);
  after(refreshInBackground);
  const { updated, current, latest, currencies, base, today, params } = analyzer;

  if (!updated) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <PageHeader title="Currency analyzer" />
        <EmptyState icon={Coins} title="Rates are loading" description="Reload this page in a minute." />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title="Currency analyzer"
        description={`Daily reference rates, last updated for ${formatCalendarDate(updated)}`}
      />
      {daysBetween(updated, today) > STALE_DAYS && (
        <Alert>
          <AlertTitle>These rates are old</AlertTitle>
          <AlertDescription>
            <p>New rates have not arrived since {formatCalendarDate(updated)}. The figures below use the saved ones.</p>
          </AlertDescription>
        </Alert>
      )}
      <Section title="Convert">
        <Calculator
          currencies={currencies}
          initial={{ from: params.from, to: params.to, date: current?.date ?? updated }}
          initialRate={
            current && { rate: current.rate, dateText: formatCalendarDate(current.date), earlier: false }
          }
          today={today}
          firstDay={FIRST_DAY}
        />
      </Section>
      <Section title={`Latest rates in ${base}`}>
        <LatestTable rows={latest} base={base} currencies={currencies} updated={updated} />
      </Section>
      <section className="grid grid-cols-1 gap-4">
        <h2 className="text-lg md:text-xl">History</h2>
        <RangeControls params={params} today={today} />
        <Section title={`${params.from} to ${params.to}`}>
          <Trend {...analyzer} />
        </Section>
        <Section title={`Compare in ${base}`}>
          <Compare {...analyzer} />
        </Section>
      </section>
      <p className="text-sm text-muted-foreground">
        For information only. The European Central Bank discourages using its rates for transactions, and banks and
        payment services add their own margin. Rates are from the European Central Bank through Frankfurter. Dirham
        rates are a central bank average against the US dollar.
      </p>
    </div>
  );
}
