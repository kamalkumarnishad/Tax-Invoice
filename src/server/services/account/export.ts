import "server-only";
import { asc, eq, getTableColumns } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { strToU8, zipSync } from "fflate";
import { siteConfig } from "@/config/site";
import { runAsUser } from "@/db/run-as-user";
import {
  auditLogs,
  businessProfiles,
  clients,
  complianceMarks,
  complianceTasks,
  expenseRecords,
  incomeRecords,
  invoiceItems,
  invoices,
  reminderLog,
  sessions,
  taxCalculations,
  taxProfiles,
  users,
  userSettings,
} from "@/db/schema";
import { toCsv } from "@/lib/csv";
import { plain } from "@/lib/money";
import type { Tx } from "../shared";

type UserTable = PgTable & { id: PgColumn; userId: PgColumn };
type Source = { file: string; table: UserTable; omit?: string[]; order?: PgColumn };

/** Every table with a user's data, and the columns that never leave the server. */
const sources: Source[] = [
  { file: "settings", table: userSettings },
  { file: "business-details", table: businessProfiles },
  { file: "tax-profiles", table: taxProfiles, omit: ["panEncrypted"], order: taxProfiles.taxYearStart },
  { file: "clients", table: clients, order: clients.createdAt },
  { file: "income", table: incomeRecords, order: incomeRecords.paymentDate },
  { file: "expenses", table: expenseRecords, order: expenseRecords.expenseDate },
  { file: "invoices", table: invoices, order: invoices.invoiceDate },
  { file: "invoice-items", table: invoiceItems, order: invoiceItems.invoiceId },
  { file: "tax-calculations", table: taxCalculations, order: taxCalculations.createdAt },
  { file: "tasks", table: complianceTasks, order: complianceTasks.dueDate },
  { file: "deadlines-marked", table: complianceMarks, order: complianceMarks.markedAt },
  { file: "reminders-sent", table: reminderLog, order: reminderLog.sentAt },
  { file: "activity", table: auditLogs, order: auditLogs.createdAt },
];
/** The app's own database role cannot read these, so they need the full-access connection. */
const closedSources: Source[] = [{ file: "signed-in-devices", table: sessions, omit: ["token"], order: sessions.createdAt }];

export const exportedTables: PgTable[] = [...sources, ...closedSources].map(({ table }) => table);

type Row = Record<string, unknown>;
type Section = { file: string; columns: string[]; rows: Row[] };

async function read(db: Tx, userId: string, { file, table, omit = [], order }: Source): Promise<Section> {
  const all: Record<string, PgColumn> = getTableColumns(table);
  const chosen = Object.fromEntries(Object.entries(all).filter(([name]) => name !== "userId" && !omit.includes(name)));
  const rows: Row[] = await db
    .select(chosen)
    .from(table)
    .where(eq(table.userId, userId))
    .orderBy(...[order, table.id].flatMap((column) => (column ? [asc(column)] : [])));
  const numeric = Object.keys(chosen).filter((name) => chosen[name]!.columnType === "PgNumeric");
  return {
    file,
    columns: Object.keys(chosen),
    rows: rows.map((row) => ({
      ...row,
      ...Object.fromEntries(numeric.map((name) => [name, row[name] === null ? null : plain(String(row[name]))])),
    })),
  };
}

/** `db` is the full-access connection. Everything the app's own role may read is read as the user. */
export async function collectUserData(db: Tx, userId: string): Promise<Section[]> {
  const [profile] = await db
    .select({ name: users.name, email: users.email, emailVerified: users.emailVerified, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId));
  const own = await runAsUser(db, userId, async (tx) => {
    const sections: Section[] = [];
    for (const source of sources) sections.push(await read(tx, userId, source));
    return sections;
  });
  const closed: Section[] = [];
  for (const source of closedSources) closed.push(await read(db, userId, source));
  return [
    { file: "profile", columns: ["name", "email", "emailVerified", "createdAt"], rows: profile ? [profile] : [] },
    ...own,
    ...closed,
  ];
}

/** "paymentDate" becomes "Payment date". */
const heading = (name: string) => {
  const words = name.replace(/([A-Z0-9]+)/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

function cell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

const readme = (date: string) => `Your data from ${siteConfig.name}, made on ${date}.

Each .csv file opens in a spreadsheet. everything.json has the same data for other software.

Left out: your password and sign-in tokens, and all but the last four characters of your PAN.
Invoice PDFs can be downloaded from each invoice.

This file holds private and financial details. Keep it somewhere safe.
`;

export function buildArchive(sections: Section[], date: string): Uint8Array<ArrayBuffer> {
  const everything = Object.fromEntries(sections.map(({ file, rows }) => [file, rows]));
  return zipSync({
    "README.txt": strToU8(readme(date)),
    "everything.json": strToU8(JSON.stringify(everything, null, 2)),
    ...Object.fromEntries(
      sections.map(({ file, columns, rows }) => [
        `${file}.csv`,
        strToU8(toCsv(columns.map(heading), rows.map((row) => columns.map((name) => cell(row[name]))))),
      ]),
    ),
  }) as Uint8Array<ArrayBuffer>;
}

const CHUNK = 64 * 1024;

/** In pieces, because the host limits the size of a reply sent in one go. */
export function toStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let position = 0;
  return new ReadableStream({
    pull(controller) {
      if (position >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(position, position + CHUNK));
      position += CHUNK;
    },
  });
}
