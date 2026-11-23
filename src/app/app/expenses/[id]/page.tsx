import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { PageHeader } from "@/components/layouts/page-header";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { CurrencyDisplay } from "@/components/shared/currency-display";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { taxYearLabel } from "@/lib/dates";
import { plain } from "@/lib/money";
import { deleteExpenseAction } from "@/server/actions/expenses";
import { getExpense } from "@/server/queries/expenses";
import { getCurrencies } from "@/server/queries/settings";
import { uuid } from "@/validations/common";
import type { ExpenseFormValues } from "@/validations/expenses";

export const metadata: Metadata = { title: "Expense record" };

export default async function ExpenseRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = uuid.safeParse((await params).id);
  const record = id.success ? await getExpense(user.id, id.data) : null;
  if (!record) notFound();

  return (
    <div className="grid gap-6">
      <PageHeader
        title={record.description}
        description={taxYearLabel(record.taxYearStart)}
        action={
          <ConfirmDelete
            noun="expense"
            name={record.description}
            action={deleteExpenseAction.bind(null, record.id)}
            returnTo="/app/expenses"
          />
        }
      />
      <p className="text-lg">
        <CurrencyDisplay amount={record.convertedAmount} currency={record.baseCurrency} />
      </p>
      <Card>
        <CardContent>
          <ExpenseForm
            id={record.id}
            baseCurrency={record.baseCurrency}
            currencies={await getCurrencies(user.id)}
            values={{
              description: record.description,
              vendor: record.vendor ?? "",
              amount: plain(record.amount),
              currency: record.currency,
              exchangeRate: record.currency === record.baseCurrency ? "" : plain(record.exchangeRate),
              expenseDate: record.expenseDate,
              category: record.category as ExpenseFormValues["category"],
              paymentMethod: record.paymentMethod as ExpenseFormValues["paymentMethod"],
              isDeductible: record.isDeductible,
              notes: record.notes ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
