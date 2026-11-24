"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { markDeadlineAction, setTaskDoneAction } from "@/server/actions/compliance";
import type { ActionResult } from "@/server/services/shared";
import type { MarkInput } from "@/validations/compliance";

type ItemActionsProps = { itemKey: string; taskId: string | null; title: string; closed: boolean };

export function ItemActions({ itemKey, taskId, title, closed }: ItemActionsProps) {
  const [pending, startTransition] = useTransition();

  const run = (work: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await work();
      if (!result.ok) toast.error(result.error);
    });
  const mark = (status: MarkInput["status"]) => run(() => markDeadlineAction({ key: itemKey, status }));
  const finish = (isDone: boolean) =>
    taskId ? run(() => setTaskDoneAction(taskId, isDone)) : mark(isDone ? "completed" : "open");

  return (
    <div className="flex flex-wrap gap-2">
      {closed ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => finish(false)}>
          Reopen<span className="sr-only">: {title}</span>
        </Button>
      ) : (
        <>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => finish(true)}>
            Done<span className="sr-only">: {title}</span>
          </Button>
          {!taskId && (
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => mark("not_applicable")}>
              Not for me<span className="sr-only">: {title}</span>
            </Button>
          )}
        </>
      )}
      {taskId && (
        <Button asChild size="sm" variant="ghost">
          <Link href={`/app/compliance/${taskId}`}>
            Edit<span className="sr-only">: {title}</span>
          </Link>
        </Button>
      )}
    </div>
  );
}
