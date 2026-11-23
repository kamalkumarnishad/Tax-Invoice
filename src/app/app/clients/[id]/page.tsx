import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchiveButton } from "@/components/clients/archive-button";
import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/layouts/page-header";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { countryOptions } from "@/lib/country-names";
import { deleteClientAction } from "@/server/actions/clients";
import { getClient } from "@/server/queries/clients";
import { getCurrencies } from "@/server/queries/settings";
import { uuid } from "@/validations/common";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = uuid.safeParse((await params).id);
  // Another user's client and a missing one look the same.
  const client = id.success ? await getClient(user.id, id.data) : null;
  if (!client) notFound();

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title={client.name}
        description={client.isActive ? undefined : "Archived"}
        action={
          <div className="flex gap-2">
            <ArchiveButton id={client.id} isActive={client.isActive} />
            <ConfirmDelete
              noun="client"
              name={client.name}
              action={deleteClientAction.bind(null, client.id)}
              returnTo="/app/clients"
            />
          </div>
        }
      />
      <Card>
        <CardContent>
          <ClientForm
            id={client.id}
            countries={countryOptions}
            currencies={await getCurrencies(user.id)}
            values={{
              name: client.name,
              company: client.company ?? "",
              email: client.email ?? "",
              country: client.country ?? "",
              currency: client.currency ?? "",
              taxId: client.taxId ?? "",
              billingAddress: client.billingAddress ?? "",
              notes: client.notes ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
