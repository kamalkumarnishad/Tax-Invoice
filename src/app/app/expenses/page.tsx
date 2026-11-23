import { Plus, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { toOptions } from "@/components/forms/options";
import { PageHeader } from "@/components/layouts/page-header";
import { CurrencyDisplay } from "@/components/shared/currency-display";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { ListSearch } from "@/components/shared/list-search";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { formatCalendarDate, taxYearLabel } from "@/lib/dates";
import { listExpenses, listExpenseYears } from "@/server/queries/expenses";
import { parseListParams } from "@/validations/common";
import { expenseCategories, parseExpenseFilters } from "@/validations/expenses";

export const metadata: Metadata = { title: "Expenses" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ExpensesPage({ searchParams }: Props) {
  const user = await requireUser();
  const raw = await searchParams;
  const { q, page } = parseListParams(raw);
  const filters = parseExpenseFilters(raw);
  const [{ rows, total, spent }, years] = await Promise.all([
    listExpenses(user.id, { q, page, ...filters }),
    listExpenseYears(user.id),
  ]);
  const filtered = Boolean(q || filters.category || filters.year);

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title="Expenses"
        action={
          <Button asChild>
            <Link href="/app/expenses/new">
              <Plus /> Add expense
            </Link>
          </Button>
        }
      />
      <ListSearch label="Search expenses" defaultValue={q}>
        <FilterSelect
          name="category"
          label="Category"
          value={filters.category}
          all="All categories"
          options={toOptions(expenseCategories)}
        />
        <FilterSelect
          name="year"
          label="Tax year"
          value={filters.year}
          all="All years"
          options={years.map((year) => ({ value: year, label: taxYearLabel(year) }))}
        />
      </ListSearch>
      {rows.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={filtered ? "No expenses match" : "No expenses yet"}
          description={filtered ? "Try a different search or filter." : "Record what you spend on your work."}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Total:{" "}
            {spent.map(({ currency, total: amount }, index) => (
              <span key={currency}>
                {index > 0 && ", "}
                <CurrencyDisplay amount={amount ?? "0"} currency={currency} className="text-foreground" />
              </span>
            ))}
          </p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{formatCalendarDate(record.expenseDate)}</TableCell>
                    <TableCell>
                      <Link
                        href={`/app/expenses/${record.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {record.description}
                      </Link>
                      {record.vendor && <p className="text-muted-foreground">{record.vendor}</p>}
                    </TableCell>
                    <TableCell>{expenseCategories[record.category as keyof typeof expenseCategories]}</TableCell>
                    <TableCell>{record.isDeductible ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-right">
                      <CurrencyDisplay amount={record.amount} currency={record.currency} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      <Pagination path="/app/expenses" params={{ q, ...filters }} page={page} total={total} />
    </div>
  );
}
