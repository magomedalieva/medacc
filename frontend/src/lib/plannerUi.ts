export type PlannerAdjustmentStatus = "postponed" | "skipped" | null;
export type PlannerAdjustmentAction = "postponed" | "skipped" | "rescheduled";

export const PLANNER_NEXT_STUDY_DAY_BUTTON_LABEL = "На след. учебный";
export const PLANNER_LOADING_POSTPONE_LABEL = "Переносим...";
export const PLANNER_SKIP_BUTTON_LABEL = "Пропустить";
export const PLANNER_LOADING_SKIP_LABEL = "Пропускаем...";
export const PLANNER_MOVED_HERE_LABEL = "Перенесено сюда";
export const PLANNER_NEW_FOCUS_LABEL = "Новый фокус";
export const PLANNER_NEXT_TASK_LABEL = "Следующая";
export const PLANNER_COMPLETED_LABEL = "Завершено";
export const PLANNER_RESCHEDULED_LABEL = "Новая дата";

export function plannerStatusLabel(status: PlannerAdjustmentStatus): string {
  if (status === "postponed") {
    return "Перенесено";
  }

  if (status === "skipped") {
    return "Пропущено";
  }

  return "Сегодня";
}

export function plannerActionImpact(action: PlannerAdjustmentAction): string {
  if (action === "postponed") {
    return "Следующий учебный день и дальнейший маршрут пересчитаны автоматически.";
  }

  if (action === "rescheduled") {
    return "Следующие даты после новой точки плана пересчитаны автоматически.";
  }

  return "Фокус подготовки смещен, а будущие дни обновлены под новый маршрут.";
}

export function plannerEmptyStateCopy(status: PlannerAdjustmentStatus): {
  title: string;
  description: string;
} {
  if (status === "postponed") {
    return {
      title: "Задача перенесена",
      description: plannerActionImpact("postponed"),
    };
  }

  if (status === "skipped") {
    return {
      title: "Задача пропущена",
      description: plannerActionImpact("skipped"),
    };
  }

  return {
    title: "На сегодня всё спокойно",
    description: "Активных задач нет. Можно перейти к свободной практике.",
  };
}
