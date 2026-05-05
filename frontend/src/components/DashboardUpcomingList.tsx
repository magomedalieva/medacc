import { formatShortDate, taskWorkloadLabel } from "../lib/format";
import { buildTaskKindLabel, buildTaskTitle, isWeeklyControlTask } from "../lib/session";
import type { PlanTask } from "../types/api";
import type { DashboardTone } from "./DashboardBadge";
import { DashboardBadge } from "./DashboardBadge";
import { DashboardButton } from "./DashboardButton";
import { DashboardMessageCard } from "./DashboardMessageCard";
import styles from "./DashboardUpcomingList.module.css";

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 11 11">
      <path
        d="M1 5.5h8M6 2.5l3 3-3 3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function estimatedTimeLabel(minutes: number): string {
  return `≈ ${minutes} мин`;
}

export type DashboardUpcomingItem = {
  task: PlanTask;
  canStart: boolean;
  marker?: {
    label: string;
    tone: DashboardTone;
  };
};

export function DashboardUpcomingList({
  items,
  startingTaskId,
  onStart,
}: {
  items: DashboardUpcomingItem[];
  startingTaskId: number | null;
  onStart: (taskId: number) => void;
}) {
  if (items.length === 0) {
    return (
      <DashboardMessageCard
        message="После первых действий здесь появятся задачи из плана."
        title="Следующие шаги еще не рассчитаны"
      />
    );
  }

  return (
    <div className={styles.list}>
      {items.map(({ task, canStart, marker }, index) => (
        <article className={styles.row} key={task.id}>
          <div className={styles.index}>{String(index + 1).padStart(2, "0")}</div>
          <div className={styles.body}>
            <div className={styles.title} title={buildTaskTitle(task)}>{buildTaskTitle(task)}</div>
            <div className={styles.meta}>
              {formatShortDate(task.scheduled_date)} · {taskWorkloadLabel(task)} · {estimatedTimeLabel(task.estimated_minutes)}
            </div>
          </div>
          <div className={styles.side}>
            {isWeeklyControlTask(task) ? (
              <DashboardBadge tone="gold">{buildTaskKindLabel(task)}</DashboardBadge>
            ) : null}
            {marker ? (
              <DashboardBadge tone={marker.tone}>{marker.label}</DashboardBadge>
            ) : null}
            <DashboardButton
              data-testid={`dashboard-upcoming-start-${task.id}`}
              disabled={!canStart || startingTaskId === task.id}
              onClick={() => onStart(task.id)}
              size="small"
              trailingIcon={<ArrowIcon />}
              variant="outline"
            >
              {!canStart
                ? "По плану позже"
                : task.task_type === "osce"
                  ? "Станция"
                  : "Открыть"}
            </DashboardButton>
          </div>
        </article>
      ))}
    </div>
  );
}
