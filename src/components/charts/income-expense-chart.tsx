"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ChartMonth = {
  label: string;
  name: string;
  /** Numbers only position the bars. The text is formatted from the exact amount. */
  income: number;
  expenses: number;
  incomeText: string;
  expensesText: string;
};

const series = [
  { key: "income", text: "incomeText", name: "Income", color: "var(--chart-1)" },
  { key: "expenses", text: "expensesText", name: "Expenses", color: "var(--chart-3)" },
] as const;

function Swatch({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-2.5 rounded-xs" style={{ background: color }} />;
}

function MonthTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: ChartMonth }[] }) {
  const month = payload?.[0]?.payload;
  if (!active || !month) return null;
  return (
    <div className="grid gap-1.5 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md">
      <p className="font-medium">{month.name}</p>
      {series.map((s) => (
        <p key={s.key} className="flex items-center gap-2">
          <Swatch color={s.color} />
          <span className="text-muted-foreground">{s.name}</span>
          <span className="ml-auto pl-4 font-mono tabular-nums">{month[s.text]}</span>
        </p>
      ))}
    </div>
  );
}

const tick = { fill: "var(--muted-foreground)", fontSize: 12 };
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

export function IncomeExpenseChart({ months }: { months: ChartMonth[] }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <ul className="flex gap-4 text-sm text-muted-foreground">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <Swatch color={s.color} /> {s.name}
          </li>
        ))}
      </ul>
      <div className="h-72" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} barGap={2} margin={{ top: 8, right: 0, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={tick} tickLine={false} axisLine={{ stroke: "var(--border)" }} />
            <YAxis
              tick={tick}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(value: number) => (value < 10_000 ? value.toLocaleString("en-IN") : compact.format(value))}
            />
            <Tooltip content={<MonthTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.6 }} />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                fill={s.color}
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground">Show as a table</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-2 font-medium">
                  Month
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Income
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  Expenses
                </th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.name} className="border-b last:border-0">
                  <th scope="row" className="py-2 text-left font-normal">
                    {month.name}
                  </th>
                  <td className="py-2 text-right font-mono tabular-nums">{month.incomeText}</td>
                  <td className="py-2 text-right font-mono tabular-nums">{month.expensesText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
