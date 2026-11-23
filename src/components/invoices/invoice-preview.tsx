import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { InvoiceView } from "@/lib/invoice-view";

function Party({ heading, name, lines }: { heading: string; name: string; lines: string[] }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="text-muted-foreground">{heading}</p>
      <p className="font-medium break-words">{name}</p>
      {lines.map((line, index) => (
        <p key={index} className="break-words text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}

export function InvoicePreview({ view }: { view: InvoiceView }) {
  return (
    <article className="grid grid-cols-1 gap-8 rounded-lg border bg-card p-6 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-2xl">{view.title}</h2>
          <p className="font-mono text-sm text-muted-foreground">{view.number}</p>
        </div>
        <dl className="grid gap-1 text-sm">
          {view.dates.map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </header>
      <div className="grid gap-6 sm:grid-cols-2">
        <Party heading="From" {...view.from} />
        <Party heading="To" {...view.to} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Unit price</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {view.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="min-w-40 whitespace-pre-wrap">{item.description}</TableCell>
              <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{item.unitPrice}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{item.amount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <dl className="ml-auto grid w-full max-w-xs gap-2 text-sm">
        {view.summary.map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono tabular-nums">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t pt-2 text-base font-medium">
          <dt>Total</dt>
          <dd className="font-mono tabular-nums">{view.total}</dd>
        </div>
        {view.settled && (
          <>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="font-mono tabular-nums">{view.settled.paid}</dd>
            </div>
            <div className="flex justify-between gap-4 font-medium">
              <dt>Balance due</dt>
              <dd className="font-mono tabular-nums">{view.settled.due}</dd>
            </div>
          </>
        )}
      </dl>
      {[
        { heading: "Tax details", lines: view.details },
        { heading: "How to pay", lines: view.payment },
        { heading: "Notes", lines: view.notes },
      ]
        .filter((section) => section.lines.length > 0)
        .map((section) => (
          <section key={section.heading} className="text-sm">
            <p className="font-medium">{section.heading}</p>
            {section.lines.map((line, index) => (
              <p key={index} className="break-words text-muted-foreground">
                {line}
              </p>
            ))}
          </section>
        ))}
    </article>
  );
}
