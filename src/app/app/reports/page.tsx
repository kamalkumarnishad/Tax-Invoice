import type { Metadata } from "next";
import { type ChartMonth, IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { PageHeader } from "@/components/layouts/page-header";
import { BreakdownTable } from "@/components/reports/breakdown-table";
import { RangePicker } from "@/components/reports/range-picker";
import { CurrencyDisplay } from "@/components/shared/currency-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { formatCalendarDate, formatMonth } from "@/lib/dates";
import { withUser } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { add, isNegative, isZero } from "@/lib/money";
import { getUserDefaults } from "@/server/queries/settings";
import { type Breakdown, buildReport } from "@/server/services/reports";
import { expenseCategories } from "@/validations/expenses";
import { incomeCategories } from "@/validations/income";
import { parseRange } from "@/validations/reports";

export const metadata: Metadata = { title: "Reports" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function Line({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 border-t pt-2 font-medium" : "flex justify-between gap-4"}>
      <dt className={strong ? undefined : "text-muted-foreground"}>{label}</dt>
      <dd className="shrink-0">{children}</dd>
    </div>
  );
}

const withLabels = (rows: Breakdown[], labels: Record<string, string>) =>
  rows.map((row) => ({ ...row, key: row.key ?? "", name: labels[row.key ?? ""] ?? "Other" }));

export default async function ReportsPage({ searchParams }: Props) {
  const user = await requireUser();
  const { currency, today } = await getUserDefaults(user.id);
  const { error, ...range } = parseRange(await searchParams, today);
  const report = await withUser(user.id, (tx) => buildReport(tx, { userId: user.id, currency, ...range }));

  const show = (amount: string) => <CurrencyDisplay amount={amount} currency={currency} />;
  const spending = add(report.businessExpenses, report.otherSpending);
  const hasRecords = !isZero(report.gross) || !isZero(spending);
  const months: ChartMonth[] = report.months.map(({ month, income, expenses }) => ({
    label: formatMonth(month, "compact"),
    name: formatMonth(month, "long"),
    income: Number(income),
    expenses: Number(expenses),
    incomeText: formatCurrency(income, currency),
    expensesText: formatCurrency(expenses, currency),
  }));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Reports"
        description={`${formatCalendarDate(range.from)} to ${formatCalendarDate(range.to)}, in ${currency}`}
      />
      <RangePicker range={range} today={today} error={error} />
      {report.otherCurrencyRecords > 0 && (
        <p className="text-sm text-muted-foreground">
          Records made in another default currency are not included: {report.otherCurrencyRecords}.
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base md:text-base">Profit before tax</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm">
              <Line label="Income received, before fees">{show(report.gross)}</Line>
              <Line label="Gateway fees and bank charges">− {show(report.fees)}</Line>
              <Line label="Business expenses">− {show(report.businessExpenses)}</Line>
              <Line label={isNegative(report.profit) ? "Loss" : "Profit"} strong>
                <CurrencyDisplay
                  amount={report.profit}
                  currency={currency}
                  tone={isNegative(report.profit) ? "negative" : "neutral"}
                />
              </Line>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base md:text-base">Cash and tax</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm">
              <Line label="Tax deducted by clients (TDS)">{show(report.tds)}</Line>
              <Line label="Net received">{show(report.net)}</Line>
              <Line label="Expenses not marked as business">{show(report.otherSpending)}</Line>
              <Line label={`Pending income (${report.pending.records})`}>{show(report.pending.total)}</Line>
            </dl>
          </CardContent>
        </Card>
      </div>
      {hasRecords && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base md:text-base">Income and expenses by month</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <IncomeExpenseChart months={months} />
          </CardContent>
        </Card>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <BreakdownTable
          title="Income by client"
          nameHeading="Client"
          rows={report.clients.map((row) => ({ ...row, key: row.key ?? "none", name: row.name ?? "No client" }))}
          whole={report.gross}
          currency={currency}
        />
        <BreakdownTable
          title="Income by category"
          nameHeading="Category"
          rows={withLabels(report.incomeCategories, incomeCategories)}
          whole={report.gross}
          currency={currency}
        />
        <BreakdownTable
          title="Expenses by category"
          nameHeading="Category"
          rows={withLabels(report.expenseCategories, expenseCategories)}
          whole={spending}
          currency={currency}
        />
      </div>
    </div>
  );
}
