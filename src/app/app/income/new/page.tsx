import type { Metadata } from "next";
import { IncomeForm } from "@/components/income/income-form";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { listClientOptions } from "@/server/queries/clients";
import { getCurrencies, getUserDefaults } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Add income" };

export default async function NewIncomePage() {
  const user = await requireUser();
  const [defaults, currencies, clients] = await Promise.all([
    getUserDefaults(user.id),
    getCurrencies(user.id),
    listClientOptions(user.id),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Add income" />
      <Card>
        <CardContent>
          <IncomeForm
            baseCurrency={defaults.currency}
            currencies={currencies}
            clients={clients}
            values={{
              description: "",
              clientId: "",
              amount: "",
              currency: defaults.currency,
              exchangeRate: "",
              paymentDate: defaults.today,
              paymentMethod: "bank_transfer",
              gatewayFee: "",
              bankCharges: "",
              tdsDeducted: "",
              category: "freelance",
              status: "received",
              notes: "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
