"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FormError } from "@/components/forms/form-error";
import { registerWithValues } from "@/components/forms/register";
import { TextField } from "@/components/forms/text-field";
import { TextareaField } from "@/components/forms/textarea-field";
import { Button } from "@/components/ui/button";
import { createTaskAction, updateTaskAction } from "@/server/actions/compliance";
import { type TaskInput, taskSchema } from "@/validations/compliance";

export function TaskForm({ id, values }: { id?: string; values: TaskInput }) {
  const router = useRouter();
  const form = useForm<TaskInput>({ resolver: zodResolver(taskSchema), defaultValues: values });
  const { errors, isSubmitting } = form.formState;
  const field = registerWithValues(form, values);

  const onSubmit = form.handleSubmit(async (input) => {
    const result = id ? await updateTaskAction(id, input) : await createTaskAction(input);
    if (!result.ok) {
      form.setError("root", { message: result.error });
      return;
    }
    toast.success(id ? "Task saved" : "Task added");
    router.push("/app/compliance");
  });

  return (
    <form onSubmit={onSubmit} noValidate autoComplete="off" className="grid max-w-xl grid-cols-1 gap-4">
      <FormError message={errors.root?.message} />
      <TextField id="title" label="Task" error={errors.title?.message} {...field.text("title")} />
      <TextField
        id="dueDate"
        label="Due date"
        type="date"
        error={errors.dueDate?.message}
        {...field.text("dueDate")}
      />
      <TextareaField
        id="description"
        label="Details"
        error={errors.description?.message}
        {...field.text("description")}
      />
      <Button type="submit" disabled={isSubmitting} className="w-fit">
        {id ? "Save task" : "Add task"}
      </Button>
    </form>
  );
}
