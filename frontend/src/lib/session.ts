import type { PlanTask } from "../types/api";

export function isOsceTask(task: PlanTask) {
  return task.task_type === "osce" && Boolean(task.osce_station_slug);
}

export function isCaseTask(task: PlanTask) {
  return task.task_type === "case";
}

export function isAccreditationTask(task: PlanTask) {
  return task.target_route === "accreditation_center" || task.intent === "exam_checkpoint";
}

export function isWeeklyControlTask(task: PlanTask) {
  return task.intent === "control" && Boolean(task.title?.startsWith("Недельный контроль"));
}

function checkpointStageLabel(task: PlanTask): string | null {
  if (task.exam_checkpoint_type === "test_stage") {
    return "тестовый этап";
  }

  if (task.exam_checkpoint_type === "case_stage") {
    return "кейсовый этап";
  }

  if (task.exam_checkpoint_type === "osce_stage") {
    return "практический этап";
  }

  return null;
}

export function buildTaskKindLabel(task: PlanTask) {
  if (isWeeklyControlTask(task)) {
    return "Недельный контроль";
  }

  if (isAccreditationTask(task)) {
    return "Этап пробной аккредитации";
  }

  if (task.task_type === "case") {
    return "Клинический кейс";
  }

  if (task.task_type === "osce") {
    return "Станция ОСКЭ";
  }

  if (task.task_type === "exam_sim") {
    return "Контроль без подсказок";
  }

  return "Тренировочный тест";
}

export function buildAccreditationTaskRoute(task: PlanTask) {
  const searchParams = new URLSearchParams();
  searchParams.set("plannedTaskId", String(task.id));

  if (task.exam_checkpoint_type) {
    searchParams.set("stage", task.exam_checkpoint_type);
  }

  if (task.topic_id !== null) {
    searchParams.set("topicId", String(task.topic_id));
  }

  if (task.osce_station_slug) {
    searchParams.set("stationSlug", task.osce_station_slug);
  }

  if (task.linked_simulation_id) {
    searchParams.set("simulationId", task.linked_simulation_id);
  }

  return `/app/accreditation?${searchParams.toString()}`;
}

export function buildSessionPayloadFromTask(task: PlanTask) {
  return {
    topic_id: task.topic_id,
    question_count: task.questions_count,
    mode: task.task_type === "exam_sim" ? ("exam" as const) : ("learning" as const),
    planned_task_id: task.id,
    simulation_id: task.linked_simulation_id,
  };
}

export function buildTaskTitle(task: PlanTask) {
  if (isAccreditationTask(task)) {
    const stageLabel = checkpointStageLabel(task);
    return stageLabel ? `Пробная аккредитация: ${stageLabel}` : "Пробная аккредитация";
  }

  if (task.title) {
    return task.title;
  }

  if (task.task_type === "exam_sim") {
    return "Контроль без подсказок";
  }

  if (task.topic_name) {
    return `Тест по теме: ${task.topic_name}`;
  }

  return "Смешанный тренировочный тест";
}
