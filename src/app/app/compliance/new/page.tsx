import type { Metadata } from "next";
import { TaskForm } from "@/components/compliance/task-form";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getUserDefaults } from "@/server/queries/settings";

export const metadata: Metadata = { title: "Add task" };

export default async function NewTaskPage() {
  const user = await requireUser();
  const { today } = await getUserDefaults(user.id);

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader title="Add task" />
      <Card>
        <CardContent>
          <TaskForm values={{ title: "", description: "", dueDate: today }} />
        </CardContent>
      </Card>
    </div>
  );
}
