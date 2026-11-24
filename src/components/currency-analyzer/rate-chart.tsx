"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type ChartPoint = {
  date: string;
  /** Both formatted on the server. */
  label: string;
  fullDate: string;
  /** Numbers only position the lines. The text is the exact figure. */
  values: Record<string, number>;
  texts: Record<string, string>;
};
type RateChartProps = { points: ChartPoint[]; series: string[]; valueHeading: string };

/** Checked for colour-blind readers in both themes; the dashes tell the lines apart without colour. */
const lines = [
  { color: "var(--line-1)", dash: undefined },
  { color: "var(--line-2)", dash: "8 4" },
  { color: "var(--line-3)", dash: "2 3" },
  { color: "var(--line-4)", dash: "10 3 2 3" },
] as const;
const palette =
  "[--line-1:#2563eb] [--line-2:#0d9488] [--line-3:#d97706] [--line-4:#be185d] dark:[--line-1:#3b82f6] dark:[--line-2:#14a08f] dark:[--line-3:#d97706] dark:[--line-4:#c2185b]";

const lineAt = (index: number) => lines[index % lines.length]!;

function Key({ index }: { index: number }) {
  const { color, dash } = lineAt(index);
  return (
    <svg aria-hidden="true" width="24" height="8" className="shrink-0">
      <line x1="0" y1="4" x2="24" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash} />
    </svg>
  );
}

type TipProps = { active?: boolean; payload?: readonly { payload?: ChartPoint }[]; series: string[] };

function PointTooltip({ active, payload, series }: TipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="grid gap-1.5 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md">
      <p className="font-medium">{point.fullDate}</p>
      {series.map((name, index) => (
        <p key={name} className="flex items-center gap-2">
          <Key index={index} />
          <span className="text-muted-foreground">{name}</span>
          <span className="ml-auto pl-4 font-mono tabular-nums">{point.texts[name]}</span>
        </p>
      ))}
    </div>
  );
}

const tick = { fill: "var(--muted-foreground)", fontSize: 12 };
const short = (value: number) => String(Number(value.toPrecision(4)));

export function RateChart({ points, series, valueHeading }: RateChartProps) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${palette}`}>
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {series.map((name, index) => (
            <li key={name} className="flex items-center gap-2">
              <Key index={index} /> {name}
            </li>
          ))}
        </ul>
      )}
      <div className="h-72" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={tick}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={48}
              tickFormatter={(date: string) => points.find((point) => point.date === date)?.label ?? date}
            />
            <YAxis
              tick={tick}
              tickLine={false}
              axisLine={false}
              width={56}
              domain={["auto", "auto"]}
              tickFormatter={short}
            />
            <Tooltip content={<PointTooltip series={series} />} cursor={{ stroke: "var(--muted-foreground)" }} />
            {series.map((name, index) => (
              <Line
                key={name}
                dataKey={(point: ChartPoint) => point.values[name]}
                name={name}
                stroke={lineAt(index).color}
                strokeWidth={2}
                strokeDasharray={lineAt(index).dash}
                dot={false}
                activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground">Show as a table</summary>
        <div className="mt-3 max-h-96 overflow-auto" tabIndex={0} role="region" aria-label="Chart data">
          <table className="w-full">
            <caption className="sr-only">{valueHeading}</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-2 font-medium">
                  Date
                </th>
                {series.map((name) => (
                  <th key={name} scope="col" className="py-2 pl-4 text-right font-medium">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.date} className="border-b last:border-0">
                  <th scope="row" className="py-2 text-left font-normal whitespace-nowrap">
                    {point.fullDate}
                  </th>
                  {series.map((name) => (
                    <td key={name} className="py-2 pl-4 text-right font-mono tabular-nums">
                      {point.texts[name]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
