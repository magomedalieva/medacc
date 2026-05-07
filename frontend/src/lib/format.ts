import type { PlanTask } from "../types/api";

function toDisplayDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }

  return new Date(value);
}

export function formatDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    ...options,
  }).format(toDisplayDate(value));
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
  }).format(toDisplayDate(value));
}

export function formatFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`;
}

export function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function greetByTime(): string {
  const hour = new Date().getHours();

  if (hour < 6) {
    return "Доброй ночи";
  }

  if (hour < 12) {
    return "Доброе утро";
  }

  if (hour < 18) {
    return "Добрый день";
  }

  return "Добрый вечер";
}

export function taskLabel(taskType: string): string {
  if (taskType === "case") {
    return "Клинический кейс";
  }

  if (taskType === "osce") {
    return "Станция ОСКЭ";
  }

  if (taskType === "exam_sim") {
    return "Пробная аккредитация";
  }

  return "Тренировочный тест";
}

export function percentage(value: number): string {
  return `${Math.round(value)}%`;
}

export function taskWorkloadLabel(task: Pick<PlanTask, "task_type" | "questions_count">): string {
  if (task.task_type === "osce") {
    return "чек-лист + мини-тест";
  }

  return `${task.questions_count} вопросов`;
}
