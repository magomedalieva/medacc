import styles from "./DashboardTimeCard.module.css";

function minutesFromSeconds(seconds: number): number {
  return Math.max(0, Math.round(seconds / 60));
}

function buildStatusLabel(isTodayStudyDay: boolean, remainingMinutes: number): string | null {
  if (!isTodayStudyDay) {
    return "пауза";
  }

  if (remainingMinutes <= 0) {
    return "лимит закрыт";
  }

  return null;
}

export function DashboardTimeCard({
  dailyStudySeconds,
  remainingStudySeconds,
  currentTaskEstimatedMinutes,
  isTodayStudyDay,
}: {
  dailyStudySeconds: number;
  todayStudySeconds: number;
  remainingStudySeconds: number;
  currentTaskEstimatedMinutes: number | null;
  isTodayStudyDay: boolean;
}) {
  const dailyMinutes = minutesFromSeconds(dailyStudySeconds);
  const remainingMinutes = minutesFromSeconds(remainingStudySeconds);
  const statusLabel = buildStatusLabel(isTodayStudyDay, remainingMinutes);

  return (
    <aside className={styles.card}>
      <div className={styles.valueBlock}>
        <span className={styles.label}>
          <span className={styles.labelIcon} aria-hidden="true" />
          Сегодня
        </span>
        <strong>
          {remainingMinutes}
          <span className={styles.timeUnit}> мин</span>
        </strong>
        <div className={styles.accentLine} aria-hidden="true" />
        <div className={styles.foot}>
          <span>из {dailyMinutes} мин</span>
          <span>
            задача {currentTaskEstimatedMinutes !== null ? `≈ ${currentTaskEstimatedMinutes} мин` : "нет"}
          </span>
          {statusLabel ? <span>{statusLabel}</span> : null}
        </div>
      </div>

      <div className={styles.clock} aria-hidden="true">
        <svg className={styles.clockSvg} viewBox="0 0 36 36" focusable="false">
          <circle className={styles.clockTrack} cx="18" cy="18" r="14.5" pathLength="100" />
          <circle className={styles.clockArc} cx="18" cy="18" r="14.5" pathLength="100" />
          <line className={styles.clockHand} x1="18" y1="18" x2="18" y2="12.6" />
          <line className={styles.clockHand} x1="18" y1="18" x2="23.5" y2="18" />
          <circle className={styles.clockPin} cx="18" cy="18" r="0.9" />
        </svg>
      </div>
    </aside>
  );
}
