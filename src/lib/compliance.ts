import type { ItemState } from "@/server/services/compliance/calendar";

export const itemStates: Record<ItemState, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  upcoming: "Upcoming",
  completed: "Done",
  not_applicable: "Not for me",
  earlier: "Before you joined",
};

/** "Today", "In 3 days", "2 days ago". */
export function relativeDays(days: number): string {
  if (days === 0) return "Today";
  const count = Math.abs(days) === 1 ? "1 day" : `${Math.abs(days)} days`;
  return days > 0 ? `In ${count}` : `${count} ago`;
}
