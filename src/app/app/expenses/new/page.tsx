import type { Metadata } from "next";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getCurrencies, getUserDefaults } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Add expense" };

export default async function NewExpensePage() {
  const user = await requireUser();
  const [defaults, currencies] = await Promise.all([getUserDefaults(user.id), getCurrencies(user.id)]);

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader title="Add expense" />
      <Card>
        <CardContent>
          <ExpenseForm
            baseCurrency={defaults.currency}
            currencies={currencies}
            values={{
              description: "",
              vendor: "",
              amount: "",
              currency: defaults.currency,
              exchangeRate: "",
              expenseDate: defaults.today,
              category: "software",
              paymentMethod: "card",
              isDeductible: true,
              notes: "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
