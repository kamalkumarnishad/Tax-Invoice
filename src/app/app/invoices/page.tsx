import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { toOptions } from "@/components/forms/options";
import { StateBadge } from "@/components/invoices/state-badge";
import { PageHeader } from "@/components/layouts/page-header";
import { CurrencyDisplay } from "@/components/shared/currency-display";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterSelect } from "@/components/shared/filter-select";
import { ListSearch } from "@/components/shared/list-search";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { formatCalendarDate } from "@/lib/dates";
import { listInvoices } from "@/server/queries/invoices";
import { getUserDefaults } from "@/server/queries/settings";
import { parseListParams } from "@/validations/common";
import { invoiceFilters, parseInvoiceFilter } from "@/validations/invoices";

export const metadata: Metadata = { title: "Invoices" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function InvoicesPage({ searchParams }: Props) {
  const user = await requireUser();
  const raw = await searchParams;
  const { q, page } = parseListParams(raw);
  const filter = parseInvoiceFilter(raw.show);
  const { today } = await getUserDefaults(user.id);
  const { rows, total, outstanding } = await listInvoices(user.id, { q, page, filter, today });

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title="Invoices"
        action={
          <Button asChild>
            <Link href="/app/invoices/new">
              <Plus /> New invoice
            </Link>
          </Button>
        }
      />
      <ListSearch label="Search invoices" defaultValue={q}>
        <FilterSelect name="show" label="Show" value={filter} all="All invoices" options={toOptions(invoiceFilters)} />
      </ListSearch>
      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={q || filter ? "No invoices match" : "No invoices yet"}
          description={q || filter ? "Try a different search or filter." : "Create one for a client and track its payment."}
        />
      ) : (
        <>
          {outstanding.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Outstanding:{" "}
              {outstanding.map(({ currency, total: amount }, index) => (
                <span key={currency}>
                  {index > 0 && ", "}
                  <CurrencyDisplay amount={amount ?? "0"} currency={currency} className="text-foreground" />
                </span>
              ))}
            </p>
          )}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ invoice, clientName, state }) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <Link
                        href={`/app/invoices/${invoice.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{clientName}</TableCell>
                    <TableCell>{formatCalendarDate(invoice.dueDate)}</TableCell>
                    <TableCell>
                      <StateBadge state={state} />
                    </TableCell>
                    <TableCell className="text-right">
                      <CurrencyDisplay amount={invoice.total} currency={invoice.currency} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
      <Pagination path="/app/invoices" params={{ q, show: filter }} page={page} total={total} />
    </div>
  );
}
