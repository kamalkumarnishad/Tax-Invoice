"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { createTask, deleteTask, markDeadline, setTaskDone, updateTask } from "@/server/services/compliance/calendar";
import { type ActionResult, INVALID, type Tx } from "@/server/services/shared";
import { uuid } from "@/validations/common";
import { markSchema, taskSchema } from "@/validations/compliance";

async function run<T>(
  schema: z.ZodType<T>,
  input: unknown,
  work: (tx: Tx, userId: string, data: T) => Promise<ActionResult>,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return INVALID;
  const result = await withUser(user.id, (tx) => work(tx, user.id, parsed.data));
  revalidatePath("/app", "layout");
  return result;
}

export async function markDeadlineAction(input: unknown): Promise<ActionResult> {
  return run(markSchema, input, markDeadline);
}

export async function createTaskAction(input: unknown): Promise<ActionResult> {
  return run(taskSchema, input, createTask);
}

export async function updateTaskAction(id: unknown, input: unknown): Promise<ActionResult> {
  return run(z.tuple([uuid, taskSchema]), [id, input], (tx, userId, data) => updateTask(tx, userId, ...data));
}

export async function setTaskDoneAction(id: unknown, isDone: unknown): Promise<ActionResult> {
  return run(z.tuple([uuid, z.boolean()]), [id, isDone], (tx, userId, data) => setTaskDone(tx, userId, ...data));
}

export async function deleteTaskAction(id: unknown): Promise<ActionResult> {
  return run(uuid, id, deleteTask);
}
