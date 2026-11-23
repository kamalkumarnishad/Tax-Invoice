import type { Metadata } from "next";
import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { countryOptions } from "@/lib/country-names";
import { getCurrencies } from "@/server/queries/settings";
import { blankClient } from "@/validations/clients";

export const metadata: Metadata = { title: "Add client" };

export default async function NewClientPage() {
  const user = await requireUser();

  return (
    <div className="grid gap-6">
      <PageHeader title="Add client" />
      <Card>
        <CardContent>
          <ClientForm values={blankClient} currencies={await getCurrencies(user.id)} countries={countryOptions} />
        </CardContent>
      </Card>
    </div>
  );
}
