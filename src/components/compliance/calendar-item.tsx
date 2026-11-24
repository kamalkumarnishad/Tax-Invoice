import { Badge } from "@/components/ui/badge";
import { itemStates, relativeDays } from "@/lib/compliance";
import { formatCalendarDate } from "@/lib/dates";
import type { CalendarItem } from "@/server/services/compliance/calendar";
import { ItemActions } from "./item-actions";

const variants = {
  overdue: "destructive",
  due_soon: "secondary",
  upcoming: "outline",
  completed: "outline",
  not_applicable: "outline",
  earlier: "outline",
} as const;

export function CalendarEntry({ item }: { item: CalendarItem }) {
  const closed = item.state === "completed" || item.state === "not_applicable";
  return (
    <li className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-[8rem_1fr_auto]">
      <div className="text-sm">
        <p className="font-medium">
          <time dateTime={item.dueDate}>{formatCalendarDate(item.dueDate)}</time>
        </p>
        <p className="text-muted-foreground">{relativeDays(item.daysLeft)}</p>
      </div>
      <div className="grid min-w-0 content-start gap-1 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-medium break-words">{item.title}</span>
          <Badge variant={variants[item.state]}>{itemStates[item.state]}</Badge>
        </p>
        {item.description && <p className="break-words text-muted-foreground">{item.description}</p>}
        {item.checklist.length > 0 && !closed && (
          <details className="text-muted-foreground">
            <summary className="w-fit cursor-pointer">Checklist</summary>
            <ul className="mt-1 list-disc pl-5">
              {item.checklist.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <ItemActions itemKey={item.key} taskId={item.taskId} title={item.title} closed={closed} />
    </li>
  );
}
