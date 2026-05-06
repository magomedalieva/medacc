import { AnimatedCounter } from "./AnimatedCounter";
import { DashboardTimeCard } from "./DashboardTimeCard";
import styles from "./DashboardHeader.module.css";

export function DashboardDeadlineCard({
  daysUntilAccreditation,
}: {
  daysUntilAccreditation: number | null;
}) {
  return (
    <aside className={styles.deadlineCard} aria-label="Дни до аккредитации">
      <div className={styles.deadlineLabel}>До аккредитации</div>
      <div className={styles.deadlineValue}>
        {daysUntilAccreditation !== null ? (
          <>
            <AnimatedCounter value={daysUntilAccreditation} />
            <span className={styles.deadlineUnit}> дн.</span>
          </>
        ) : (
          "—"
        )}
      </div>
      <div className={styles.deadlineBar}>
        <div className={styles.deadlineFill} />
      </div>
    </aside>
  );
}

export function DashboardHeader({
  greeting,
  firstName,
  lastName,
  subtitle,
  daysUntilAccreditation,
  dailyStudySeconds,
  todayStudySeconds,
  remainingStudySeconds,
  currentTaskEstimatedMinutes,
  isTodayStudyDay,
}: {
  greeting: string;
  firstName: string;
  lastName: string;
  subtitle: string;
  daysUntilAccreditation: number | null;
  dailyStudySeconds: number;
  todayStudySeconds: number;
  remainingStudySeconds: number;
  currentTaskEstimatedMinutes: number | null;
  isTodayStudyDay: boolean;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.copy}>
        <div className={styles.kicker}>{greeting}</div>
        <h1 className={styles.title}>
          {firstName} <em>{lastName}</em>
        </h1>
        <p className={styles.subtitle}>{subtitle}</p>
      </div>
      <div className={styles.statusRail}>
        <DashboardDeadlineCard daysUntilAccreditation={daysUntilAccreditation} />
        <DashboardTimeCard
          currentTaskEstimatedMinutes={currentTaskEstimatedMinutes}
          dailyStudySeconds={dailyStudySeconds}
          isTodayStudyDay={isTodayStudyDay}
          remainingStudySeconds={remainingStudySeconds}
          todayStudySeconds={todayStudySeconds}
        />
      </div>
    </header>
  );
}
