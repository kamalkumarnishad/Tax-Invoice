import { Calculator, ChartColumn, Scale, TrendingUp, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { type ChartMonth, IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/layouts/page-header";
import { CurrencyDisplay } from "@/components/shared/currency-display";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { relativeDays } from "@/lib/compliance";
import { formatCalendarDate, formatMonth, taxYearLabel, taxYearStartFor } from "@/lib/dates";
import { withUser } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { isNegative, plain } from "@/lib/money";
import { getCalendar } from "@/server/queries/compliance";
import { getTaxProfile, getUserDefaults } from "@/server/queries/settings";
import { isOpen } from "@/server/services/compliance/calendar";
import { summarise } from "@/server/services/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [{ currency, today }, profile, calendar] = await Promise.all([
    getUserDefaults(user.id),
    getTaxProfile(user.id),
    getCalendar(user),
  ]);
  const next = calendar.items.filter(isOpen).slice(0, 3);
  const year = taxYearStartFor(today);
  const summary = await withUser(user.id, (tx) => summarise(tx, { userId: user.id, currency, year }));

  const show = (amount: string) => <CurrencyDisplay amount={amount} currency={currency} />;
  const hasPending = plain(summary.pending) !== "0";
  const hasRecords = summary.months.some((m) => plain(m.income) !== "0" || plain(m.expenses) !== "0");
  const months: ChartMonth[] = summary.months.map(({ month, income, expenses }) => ({
    label: formatMonth(month, "short"),
    name: formatMonth(month, "long"),
    income: Number(income),
    expenses: Number(expenses),
    incomeText: formatCurrency(income, currency),
    expensesText: formatCurrency(expenses, currency),
  }));

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader title="Dashboard" description={`${taxYearLabel(year)}, in ${currency}`} />
      {!profile && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">Set up your tax profile</p>
              <p className="text-sm text-muted-foreground">
                Estimates need your tax year, regime and business structure.
              </p>
            </div>
            <Button asChild>
              <Link href="/app/settings?tab=tax">Set up</Link>
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Income"
          icon={TrendingUp}
          value={show(summary.income)}
          note={
            hasPending ? `Plus ${formatCurrency(summary.pending, currency)} pending` : "Received, before fees and TDS"
          }
        />
        <StatCard title="Expenses" icon={Wallet} value={show(summary.expenses)} note="All recorded expenses" />
        <StatCard
          title="Income minus expenses"
          icon={Scale}
          value={
            <CurrencyDisplay
              amount={summary.profit}
              currency={currency}
              tone={isNegative(summary.profit) ? "negative" : "neutral"}
            />
          }
          note="Before tax"
        />
        <StatCard
          title="Estimated tax"
          icon={Calculator}
          value={<span className="font-mono">—</span>}
          note="See the tax calculator"
        />
      </div>
      {summary.otherCurrencyRecords > 0 && (
        <p className="text-sm text-muted-foreground">
          {summary.otherCurrencyRecords === 1
            ? "1 record was made in another default currency and is not included."
            : `${summary.otherCurrencyRecords} records were made in another default currency and are not included.`}
        </p>
      )}
      {next.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              <h2 className="text-base md:text-base">Next deadlines</h2>
              <Link href="/app/compliance" className="text-sm font-normal underline underline-offset-4">
                All
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {next.map((item) => (
                <li key={item.key} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="min-w-0 break-words">{item.title}</span>
                  <span className={item.state === "overdue" ? "text-destructive" : "text-muted-foreground"}>
                    {formatCalendarDate(item.dueDate)} · {relativeDays(item.daysLeft)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="text-base md:text-base">Income and expenses by month</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasRecords ? (
            <IncomeExpenseChart months={months} />
          ) : (
            <EmptyState
              icon={ChartColumn}
              title="Nothing to chart yet"
              description="Received income and expenses for this tax year will appear here."
              action={
                <Button asChild variant="outline">
                  <Link href="/app/income/new">Add income</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
