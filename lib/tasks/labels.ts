import type { TaskPriority, TaskStatus } from "@/lib/types";

export const TASK_PRIORITY_KEY: Record<TaskPriority, string> = {
  low: "tasks.priorityLow",
  normal: "tasks.priorityNormal",
  high: "tasks.priorityHigh",
  urgent: "tasks.priorityUrgent",
};

export const TASK_STATUS_KEY: Record<TaskStatus, string> = {
  open: "tasks.statusOpen",
  "in-progress": "tasks.statusInProgress",
  done: "tasks.statusDone",
  cancelled: "tasks.statusCancelled",
};

export const TASK_PRIORITIES: TaskPriority[] = ["low", "normal", "high", "urgent"];
export const TASK_STATUSES: TaskStatus[] = ["open", "in-progress", "done", "cancelled"];
