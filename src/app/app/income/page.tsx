import { Plus, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layouts/page-header";
import { CurrencyDisplay } from "@/components/shared/currency-display";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { ListSearch } from "@/components/shared/list-search";
import { Pagination } from "@/components/shared/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toOptions } from "@/components/forms/options";
import { requireUser } from "@/lib/auth";
import { formatCalendarDate, taxYearLabel } from "@/lib/dates";
import { listClientOptions } from "@/server/queries/clients";
import { listIncome, listIncomeYears } from "@/server/queries/income";
import { parseListParams } from "@/validations/common";
import { incomeStatuses, parseIncomeFilters } from "@/validations/income";

export const metadata: Metadata = { title: "Income" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function IncomePage({ searchParams }: Props) {
  const user = await requireUser();
  const raw = await searchParams;
  const { q, page } = parseListParams(raw);
  const filters = parseIncomeFilters(raw);
  const [{ rows, total, received }, clients, years] = await Promise.all([
    listIncome(user.id, { q, page, ...filters }),
    listClientOptions(user.id),
    listIncomeYears(user.id),
  ]);
  const filtered = Boolean(q || filters.client || filters.status || filters.year);

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title="Income"
        action={
          <Button asChild>
            <Link href="/app/income/new">
              <Plus /> Add income
            </Link>
          </Button>
        }
      />
      <ListSearch label="Search income" defaultValue={q}>
        <FilterSelect name="client" label="Client" value={filters.client} all="All clients" options={clients} />
        <FilterSelect
          name="status"
          label="Status"
          value={filters.status}
          all="All statuses"
          options={toOptions(incomeStatuses)}
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
          icon={TrendingUp}
          title={filtered ? "No income matches" : "No income yet"}
          description={filtered ? "Try a different search or filter." : "Record what your clients pay you."}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Received before fees:{" "}
            {received.length === 0
              ? "none"
              : received.map(({ currency, total: amount }, index) => (
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
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Net received</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ record, clientName }) => (
                  <TableRow key={record.id}>
                    <TableCell>{formatCalendarDate(record.paymentDate)}</TableCell>
                    <TableCell>
                      <Link
                        href={`/app/income/${record.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {record.description}
                      </Link>
                      {clientName && <p className="text-muted-foreground">{clientName}</p>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={record.status === "received" ? "secondary" : "outline"}>
                        {incomeStatuses[record.status as keyof typeof incomeStatuses]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <CurrencyDisplay amount={record.amount} currency={record.currency} />
                    </TableCell>
                    <TableCell className="text-right">
                      {record.status === "received" ? (
                        <CurrencyDisplay amount={record.netReceived} currency={record.baseCurrency} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      <Pagination path="/app/income" params={{ q, ...filters }} page={page} total={total} />
    </div>
  );
}
