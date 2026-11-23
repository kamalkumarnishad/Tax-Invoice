import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IncomeForm } from "@/components/income/income-form";
import { PageHeader } from "@/components/layouts/page-header";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { CurrencyDisplay } from "@/components/shared/currency-display";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { taxYearLabel } from "@/lib/dates";
import { plain } from "@/lib/money";
import { deleteIncomeAction } from "@/server/actions/income";
import { listClientOptions } from "@/server/queries/clients";
import { getIncome } from "@/server/queries/income";
import { getCurrencies } from "@/server/queries/settings";
import { uuid } from "@/validations/common";
import type { IncomeFormValues } from "@/validations/income";

export const metadata: Metadata = { title: "Income record" };

const blankIfZero = (amount: string) => (plain(amount) === "0" ? "" : plain(amount));

export default async function IncomeRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = uuid.safeParse((await params).id);
  const record = id.success ? await getIncome(user.id, id.data) : null;
  if (!record) notFound();
  const [currencies, clients] = await Promise.all([getCurrencies(user.id), listClientOptions(user.id)]);

  const figures = [
    { label: "Before fees", value: record.convertedAmount },
    { label: "Net received", value: record.netReceived },
    { label: "TDS deducted", value: record.tdsDeducted },
  ];

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title={record.description}
        description={taxYearLabel(record.taxYearStart)}
        action={
          <ConfirmDelete
            noun="income record"
            name={record.description}
            action={deleteIncomeAction.bind(null, record.id)}
            returnTo="/app/income"
          />
        }
      />
      {record.invoiceId && (
        <p className="text-sm text-muted-foreground">
          A payment for{" "}
          <Link href={`/app/invoices/${record.invoiceId}`} className="text-foreground underline underline-offset-4">
            an invoice
          </Link>
          . Deleting it makes that amount due again.
        </p>
      )}
      <dl className="grid gap-4 sm:grid-cols-3">
        {figures.map(({ label, value }) => (
          <div key={label} className="rounded-lg border p-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-lg">
              <CurrencyDisplay amount={value} currency={record.baseCurrency} />
            </dd>
          </div>
        ))}
      </dl>
      <Card>
        <CardContent>
          <IncomeForm
            id={record.id}
            baseCurrency={record.baseCurrency}
            currencies={currencies}
            clients={clients}
            values={{
              description: record.description,
              clientId: record.clientId ?? "",
              amount: plain(record.amount),
              currency: record.currency,
              exchangeRate: record.currency === record.baseCurrency ? "" : plain(record.exchangeRate),
              paymentDate: record.paymentDate,
              paymentMethod: record.paymentMethod as IncomeFormValues["paymentMethod"],
              gatewayFee: blankIfZero(record.gatewayFee),
              bankCharges: blankIfZero(record.bankCharges),
              tdsDeducted: blankIfZero(record.tdsDeducted),
              category: record.category as IncomeFormValues["category"],
              status: record.status as IncomeFormValues["status"],
              notes: record.notes ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
