import { Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layouts/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListSearch } from "@/components/shared/list-search";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { countryName } from "@/lib/country-names";
import { listClients } from "@/server/queries/clients";
import { parseListParams } from "@/validations/common";

export const metadata: Metadata = { title: "Clients" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ClientsPage({ searchParams }: Props) {
  const user = await requireUser();
  const raw = await searchParams;
  const { q, page } = parseListParams(raw);
  const archived = raw.show === "archived";
  const { rows, total } = await listClients(user.id, { q, page, archived });
  const show = archived ? "archived" : "";

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title="Clients"
        action={
          <Button asChild>
            <Link href="/app/clients/new">
              <Plus /> Add client
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ListSearch label="Search clients" defaultValue={q}>
          {archived && <input type="hidden" name="show" value="archived" />}
        </ListSearch>
        <Button asChild variant="link" className="px-0">
          <Link href={archived ? "/app/clients" : "/app/clients?show=archived"}>
            {archived ? "Show active" : "Show archived"}
          </Link>
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "No clients match your search" : archived ? "No archived clients" : "No clients yet"}
          description={
            q || archived ? "Try a different search or filter." : "Add the people and companies who pay you."
          }
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Currency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((client) => (
                <TableRow key={client.id}>
                  <TableCell>
                    <Link href={`/app/clients/${client.id}`} className="font-medium underline-offset-4 hover:underline">
                      {client.name}
                    </Link>
                    {client.company && <p className="text-muted-foreground">{client.company}</p>}
                  </TableCell>
                  <TableCell>{client.email ?? "—"}</TableCell>
                  <TableCell>{client.country ? countryName(client.country) : "—"}</TableCell>
                  <TableCell>{client.currency ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pagination path="/app/clients" params={{ q, show }} page={page} total={total} />
    </div>
  );
}
