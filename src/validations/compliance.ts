import { z } from "zod";
import { optionalText } from "./common";
import { recordDate } from "./money";

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Name this task").max(255, "Use at most 255 characters"),
  description: optionalText(1000),
  dueDate: recordDate,
});

export type TaskInput = z.infer<typeof taskSchema>;

export const markSchema = z.object({
  key: z.string().min(1).max(100),
  status: z.enum(["completed", "not_applicable", "open"]),
});

export type MarkInput = z.infer<typeof markSchema>;
