import type { PlanTask, ReadinessSummary } from "../types/api";
import { formatDate } from "../lib/format";
import { isWeeklyControlTask } from "../lib/session";
import { StatusBadge } from "./StatusBadge";
import styles from "./ScheduleFocusCard.module.css";

function toneForStatus(status: string): "default" | "accent" | "green" | "warm" {
  if (status === "ready") {
    return "green";
  }

  if (status === "building") {
    return "warm";
  }

  return "accent";
}

function taskSupportsTrack(task: PlanTask, trackKey: string): boolean {
  if (trackKey === "tests") {
    return task.exam_checkpoint_type === "test_stage" || task.task_type === "test" || task.task_type === "exam_sim";
  }

  if (trackKey === "cases") {
    return task.exam_checkpoint_type === "case_stage" || task.task_type === "case";
  }

  if (trackKey === "osce") {
    return task.exam_checkpoint_type === "osce_stage" || task.task_type === "osce";
  }

  return false;
}

function isProtocolStagePassed(readiness: ReadinessSummary, trackKey: string): boolean {
  return readiness.exam_protocol.stages.some((stage) => stage.key === trackKey && stage.status === "passed");
}

function buildConfirmedProtocolLabel(readiness: ReadinessSummary): string | null {
  const confirmedStages = readiness.exam_protocol.stages
    .filter((stage) => stage.status === "passed")
    .map((stage) => stage.label.toLowerCase());

  if (confirmedStages.length === 0) {
    return null;
  }

  return `Протокол уже подтвердил: ${confirmedStages.join(", ")}. План больше не ставит по ним строгие чекпоинты и смещает фокус к еще не закрытым этапам.`;
}

function taskFormatLabel(task: PlanTask): string {
  if (isWeeklyControlTask(task)) {
    return "недельный контроль";
  }

  if (task.intent === "exam_checkpoint") {
    return "этап пробной аккредитации";
  }

  if (task.task_type === "exam_sim") {
    return "контрольный тест";
  }

  if (task.task_type === "case") {
    return "кейс";
  }

  if (task.task_type === "osce") {
    return "станция ОСКЭ";
  }

  return "тест";
}

function focusDetailCopy(detail: string, isTodayStudyDay: boolean): string {
  if (isTodayStudyDay) {
    return detail;
  }

  return detail.replace("Последний контрольный контакт был сегодня.", "Свежий контрольный контакт уже учтен.");
}

export function ScheduleFocusCard({
  readiness,
  activeTask,
  daysUntilAccreditation,
  isTodayStudyDay,
  serverToday,
}: {
  readiness: ReadinessSummary;
  activeTask: PlanTask | null;
  daysUntilAccreditation: number | null;
  isTodayStudyDay: boolean;
  serverToday: string;
}) {
  const focusTrack =
    readiness.tracks.find((track) => track.key === readiness.recommended_focus_key) ??
    readiness.tracks[0] ??
    null;

  if (!focusTrack) {
    return null;
  }

  const activeTaskTrack = activeTask
    ? readiness.tracks.find((track) => taskSupportsTrack(activeTask, track.key)) ?? null
    : null;
  const recommendedTrackConfirmed = isProtocolStagePassed(readiness, focusTrack.key);
  const activeTaskTrackConfirmed = activeTaskTrack ? isProtocolStagePassed(readiness, activeTaskTrack.key) : false;
  const unconfirmedTrack =
    readiness.tracks.find((track) => !isProtocolStagePassed(readiness, track.key)) ?? focusTrack;
  const protocolAwareFocusTrack =
    recommendedTrackConfirmed
      ? activeTaskTrack && !activeTaskTrackConfirmed
        ? activeTaskTrack
        : unconfirmedTrack
      : focusTrack;
  const confirmedProtocolLabel = buildConfirmedProtocolLabel(readiness);
  const weeklyControlLabel = activeTask && isWeeklyControlTask(activeTask)
    ? "Это контроль недели: он собирает данные для пересчета учебного маршрута, но не закрывает протокол пробной аккредитации."
    : null;
  const focusShiftedByProtocol = recommendedTrackConfirmed && protocolAwareFocusTrack.key !== focusTrack.key;
  const alignedWithTask = activeTask ? taskSupportsTrack(activeTask, protocolAwareFocusTrack.key) : false;
  const activeTaskDateLabel = activeTask
    ? activeTask.scheduled_date === serverToday
      ? "сегодня"
      : formatDate(activeTask.scheduled_date, {
          weekday: "long",
          day: "2-digit",
          month: "long",
        })
    : null;
  const title = !isTodayStudyDay
    ? "Пауза по графику"
    : focusShiftedByProtocol
      ? `План смещен: ${protocolAwareFocusTrack.label.toLowerCase()}`
      : alignedWithTask
        ? `План усиливает: ${protocolAwareFocusTrack.label.toLowerCase()}`
        : `Главный риск сейчас: ${protocolAwareFocusTrack.label.toLowerCase()}`;
  const summary = !isTodayStudyDay
    ? activeTask
      ? `По учебному графику сегодня пауза. Ближайшая задача — ${activeTask.title}, ${activeTaskDateLabel}. Она остается первой, потому что трек «${protocolAwareFocusTrack.label}» сейчас сильнее всего влияет на учебный прогноз.`
      : `По учебному графику сегодня пауза. Следующий учебный день появится в маршруте после пересчета доступных задач.`
    : activeTask
      ? alignedWithTask
        ? `Ближайшая задача — ${activeTask.title}. Она стоит первой, потому что именно этот этап сейчас сильнее всего тянет вниз учебный прогноз.`
        : `Ближайшая задача — ${activeTask.title}. Она поддерживает общий ритм подготовки, но основной дефицит сейчас все еще в треке «${protocolAwareFocusTrack.label}».`
      : `Сейчас система сильнее всего следит за треком «${protocolAwareFocusTrack.label}» и будет подстраивать маршрут вокруг него.`;
  const focusDetail = focusDetailCopy(protocolAwareFocusTrack.detail, isTodayStudyDay);

  return (
    <article className={styles.card}>
      <div className={styles.header}>
        <div className={styles.kicker}>Логика маршрута</div>
        <div className={styles.badges}>
          <StatusBadge label={`Учебный прогноз ${Math.round(readiness.overall_readiness_percent)}%`} tone={toneForStatus(protocolAwareFocusTrack.status)} />
          <StatusBadge label={protocolAwareFocusTrack.label} tone={toneForStatus(protocolAwareFocusTrack.status)} />
        </div>
      </div>

      <div className={styles.title}>{title}</div>
      <p className={styles.summary}>{summary}</p>
      {confirmedProtocolLabel ? (
        <div className={styles.protocolNote} data-testid="schedule-protocol-context">
          {confirmedProtocolLabel}
        </div>
      ) : null}
      {weeklyControlLabel ? (
        <div className={styles.weeklyNote} data-testid="schedule-weekly-control-context">
          {weeklyControlLabel}
        </div>
      ) : null}

      <div className={styles.metaRow}>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>{isTodayStudyDay ? "Почему сейчас" : "Почему этот фокус"}</div>
          <div className={styles.metaValue}>{focusDetail}</div>
        </div>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>Что это закроет</div>
          <div className={styles.metaValue}>
            {activeTask ? `Задача формата «${taskFormatLabel(activeTask)}» помогает сократить дефицит по этапу «${protocolAwareFocusTrack.label}».` : `Следующие задачи будут сокращать дефицит по этапу «${protocolAwareFocusTrack.label}».`}
          </div>
        </div>
        <div className={styles.metaCard}>
          <div className={styles.metaLabel}>До аккредитации</div>
          <div className={styles.metaValue}>
            {daysUntilAccreditation !== null ? `${daysUntilAccreditation} дн.` : "Не задано"}
          </div>
        </div>
      </div>

      <div className={styles.tracks}>
        {readiness.tracks.map((track) => (
          <div className={styles.trackRow} key={track.key}>
            <div className={styles.trackHead}>
              <div className={styles.trackLabel}>{track.label}</div>
              <div className={styles.trackValue}>{Math.round(track.readiness_percent)}%</div>
            </div>
            <div className={styles.trackBar}>
              <div
                className={`${styles.trackFill} ${
                  track.status === "ready"
                    ? styles.greenFill
                    : track.status === "building"
                      ? styles.warmFill
                      : styles.accentFill
                }`}
                style={{ width: `${track.readiness_percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
