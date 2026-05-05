import { formatShortDate } from "../lib/format";
import {
  plannerEmptyStateCopy,
  plannerStatusLabel,
  PLANNER_LOADING_POSTPONE_LABEL,
  PLANNER_LOADING_SKIP_LABEL,
  PLANNER_NEXT_STUDY_DAY_BUTTON_LABEL,
  PLANNER_SKIP_BUTTON_LABEL,
} from "../lib/plannerUi";
import { buildTaskKindLabel, buildTaskTitle, isWeeklyControlTask } from "../lib/session";
import type { PlanTask } from "../types/api";
import { DashboardBadge } from "./DashboardBadge";
import { DashboardButton } from "./DashboardButton";
import styles from "./DashboardTodayPanel.module.css";

export type DashboardTodayStatus = "postponed" | "skipped" | null;

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 13 13">
      <path
        d="M1.5 6.5h9M7 2.5l4 4-4 4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12">
      <rect
        x="1.5"
        y="2.5"
        width="9"
        height="8"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M4 1.5v2M8 1.5v2M1.5 5h9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function SkipIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 12">
      <path
        d="M1.5 6h7M6 3.5l3 2.5-3 2.5M10.5 3.5v5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function formatEstimatedMinutes(minutes: number): string {
  return `≈ ${minutes} мин`;
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18">
      <path
        d="M4 9l3.5 3.5L14 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function PostponedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18">
      <rect
        x="2"
        y="3"
        width="14"
        height="12"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M6 2v2M12 2v2M2 7h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function SkippedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18">
      <path
        d="M2.5 9h11M10 5l4 4-4 4M15.5 5v8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function DiagnosticIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18">
      <path
        d="M4 3.5h10M4 7h10M4 10.5h6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <path
        d="m10.5 13 1.7 1.7 3.3-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function DashboardDiagnosticCard({
  scheduledDate,
  starting,
  onStart,
}: {
  scheduledDate: string;
  starting: boolean;
  onStart: () => void;
}) {
  return (
    <article className={styles.hero}>
      <div aria-hidden="true" className={styles.glow} />
      <div aria-hidden="true" className={styles.shimmer} />

      <div className={styles.heroTop}>
        <div className={styles.badges}>
          <DashboardBadge pulseTone="accent" tone="accent">
            Первый шаг
          </DashboardBadge>
          <DashboardBadge tone="default">Диагностический тест</DashboardBadge>
        </div>
      </div>

      <h3 className={styles.title}>Стартовая диагностика</h3>
      <p className={styles.description}>
        Короткий смешанный тест без подсказок. Он нужен, чтобы система увидела начальный уровень и после этого
        точнее расставила темы, кейсы и станции в плане.
      </p>

      <div className={styles.meta}>
        <div className={styles.metaChip}>
          <div className={styles.metaLabel}>Формат</div>
          <div className={styles.metaValue}>Смешанный тест</div>
        </div>
        <div className={styles.metaChip}>
          <div className={styles.metaLabel}>Вопросов</div>
          <div className={styles.metaValue}>30</div>
        </div>
        <div className={styles.metaChip}>
          <div className={styles.metaLabel}>Дата</div>
          <div className={styles.metaValue}>{formatShortDate(scheduledDate)}</div>
        </div>
        <div className={styles.metaChip}>
          <div className={styles.metaLabel}>Время</div>
          <div className={styles.metaValue}>≈ 30 мин</div>
        </div>
      </div>

      <div className={styles.actions}>
        <DashboardButton
          iconMotion="forward"
          leadingIcon={<DiagnosticIcon />}
          loading={starting}
          onClick={onStart}
          variant="primary"
        >
          Начать диагностику
        </DashboardButton>
      </div>
    </article>
  );
}

export function DashboardTodayCard({
  task,
  description,
  isOverdue,
  status,
  starting,
  postponing,
  skipping,
  onStart,
  onPostpone,
  onSkip,
}: {
  task: PlanTask;
  description: string;
  isOverdue: boolean;
  status: DashboardTodayStatus;
  starting: boolean;
  postponing: boolean;
  skipping: boolean;
  onStart: () => void;
  onPostpone: () => void;
  onSkip: () => void;
}) {
  const busy = starting || postponing || skipping;
  const taskKindTone = isWeeklyControlTask(task) ? "gold" : "default";

  return (
    <article className={styles.hero}>
      <div aria-hidden="true" className={styles.glow} />
      <div aria-hidden="true" className={styles.shimmer} />

      <div className={styles.heroTop}>
        <div className={styles.badges}>
          <DashboardBadge pulseTone={isOverdue ? "gold" : "accent"} tone={isOverdue ? "gold" : "accent"}>
            {isOverdue ? "Просрочено" : "Сегодня"}
          </DashboardBadge>
          <DashboardBadge tone={taskKindTone}>{buildTaskKindLabel(task)}</DashboardBadge>
          {status ? (
            <DashboardBadge tone={status === "postponed" ? "gold" : "default"}>
              {plannerStatusLabel(status)}
            </DashboardBadge>
          ) : null}
        </div>
      </div>

      <h3 className={styles.title}>{buildTaskTitle(task)}</h3>
      <p className={styles.description}>{description}</p>

      <div className={styles.meta}>
        <div className={styles.metaChip}>
          <div className={styles.metaLabel}>Формат</div>
          <div className={styles.metaValue}>{buildTaskKindLabel(task)}</div>
        </div>
        <div className={styles.metaChip}>
          <div className={styles.metaLabel}>
            {task.task_type === "osce" ? "Элементов" : "Вопросов"}
          </div>
          <div className={styles.metaValue}>{task.questions_count}</div>
        </div>
        <div className={styles.metaChip}>
          <div className={styles.metaLabel}>Дата</div>
          <div className={styles.metaValue}>{formatShortDate(task.scheduled_date)}</div>
        </div>
        <div className={styles.metaChip}>
          <div className={styles.metaLabel}>Время</div>
          <div className={styles.metaValue}>{formatEstimatedMinutes(task.estimated_minutes)}</div>
        </div>
      </div>

      <div className={styles.actions}>
        <DashboardButton
          iconMotion="forward"
          leadingIcon={<ArrowIcon />}
          loading={starting}
          onClick={onStart}
          variant="primary"
        >
          {task.task_type === "osce" ? "Открыть станцию" : "Начать сейчас"}
        </DashboardButton>
        <DashboardButton
          disabled={busy}
          leadingIcon={<CalendarIcon />}
          onClick={onPostpone}
          variant="outline"
        >
          {postponing ? PLANNER_LOADING_POSTPONE_LABEL : PLANNER_NEXT_STUDY_DAY_BUTTON_LABEL}
        </DashboardButton>
        <DashboardButton
          disabled={busy}
          leadingIcon={<SkipIcon />}
          onClick={onSkip}
          variant="ghost"
        >
          {skipping ? PLANNER_LOADING_SKIP_LABEL : PLANNER_SKIP_BUTTON_LABEL}
        </DashboardButton>
      </div>
    </article>
  );
}

export function DashboardTodayEmptyCard({
  hasStudyTime,
  isTodayStudyDay,
  nextStudyDate,
  status,
}: {
  hasStudyTime: boolean;
  isTodayStudyDay: boolean;
  nextStudyDate: string | null;
  status: DashboardTodayStatus;
}) {
  const { title, description } = !isTodayStudyDay
    ? {
        title: "Сегодня выходной",
        description: nextStudyDate
          ? `Плановая пауза по учебному графику. Ближайший учебный день — ${formatShortDate(nextStudyDate)}.`
          : "Плановая пауза по учебному графику. Доступных учебных дней до аккредитации сейчас нет.",
      }
    : !hasStudyTime
      ? {
          title: "Лимит на сегодня закрыт",
          description: "Запланированное учебное время уже использовано. Следующие задачи останутся в маршруте.",
        }
      : plannerEmptyStateCopy(status);

  return (
    <article className={styles.emptyCard}>
      <div
        aria-hidden="true"
        className={`${styles.emptyStripe} ${
          status === "postponed"
            ? styles.emptyStripeGold
            : status === "skipped"
              ? styles.emptyStripeMuted
              : styles.emptyStripeDefault
        }`}
      />
      <div className={styles.emptyIcon}>
        {status === "postponed" ? (
          <PostponedIcon />
        ) : status === "skipped" ? (
          <SkippedIcon />
        ) : (
          <CheckIcon />
        )}
      </div>
      <h3 className={styles.emptyTitle}>{title}</h3>
      <p className={styles.emptyDescription}>{description}</p>
      {status ? (
        <DashboardBadge tone={status === "postponed" ? "gold" : "default"}>
          {plannerStatusLabel(status)}
        </DashboardBadge>
      ) : null}
    </article>
  );
}
