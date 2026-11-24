import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TaskForm } from "@/components/compliance/task-form";
import { PageHeader } from "@/components/layouts/page-header";
import { ConfirmDelete } from "@/components/shared/confirm-delete";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { deleteTaskAction } from "@/server/actions/compliance";
import { getTask } from "@/server/queries/compliance";
import { uuid } from "@/validations/common";

export const metadata: Metadata = { title: "Edit task" };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = uuid.safeParse((await params).id);
  const task = id.success ? await getTask(user.id, id.data) : null;
  if (!task) notFound();

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title="Edit task"
        action={
          <ConfirmDelete
            noun="task"
            name={task.title}
            action={deleteTaskAction.bind(null, task.id)}
            returnTo="/app/compliance"
          />
        }
      />
      <Card>
        <CardContent>
          <TaskForm
            id={task.id}
            values={{ title: task.title, description: task.description ?? "", dueDate: task.dueDate }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
