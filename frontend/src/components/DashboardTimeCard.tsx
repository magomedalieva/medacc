import { useEffect, useMemo, useState, type CSSProperties } from "react";

import styles from "./DashboardTimeCard.module.css";

function minutesFromSeconds(seconds: number): number {
  return Math.max(0, Math.round(seconds / 60));
}

function formatMinutes(minutes: number): string {
  return `${minutes} мин`;
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
  todayStudySeconds,
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
  const [now, setNow] = useState(() => new Date());
  const dailyMinutes = minutesFromSeconds(dailyStudySeconds);
  const remainingMinutes = minutesFromSeconds(remainingStudySeconds);
  const statusLabel = buildStatusLabel(isTodayStudyDay, remainingMinutes);
  const progress = dailyStudySeconds > 0
    ? Math.max(0, Math.min(100, (todayStudySeconds / dailyStudySeconds) * 100))
    : 0;
  const clockProgress = progress > 0 ? progress : 8;
  const hourAngle = ((now.getHours() % 12) + now.getMinutes() / 60) * 30;
  const minuteAngle = now.getMinutes() * 6;
  const clockStyle = useMemo(
    () =>
      ({
        "--hour-angle": `${hourAngle}deg`,
        "--minute-angle": `${minuteAngle}deg`,
        "--study-progress": `${clockProgress}%`,
      }) as CSSProperties,
    [clockProgress, hourAngle, minuteAngle],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <aside className={styles.card} style={clockStyle}>
      <div className={styles.valueBlock}>
        <span className={styles.label}>
          <span className={styles.labelIcon} aria-hidden="true" />
          Сегодня
        </span>
        <strong>{formatMinutes(remainingMinutes)}</strong>
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
        <span className={`${styles.hand} ${styles.hourHand}`} />
        <span className={`${styles.hand} ${styles.minuteHand}`} />
        <span className={styles.pin} />
      </div>
    </aside>
  );
}
