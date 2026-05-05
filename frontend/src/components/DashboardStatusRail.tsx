import { DashboardDeadlineCard } from "./DashboardHeader";
import { DashboardTimeCard } from "./DashboardTimeCard";
import styles from "./DashboardHeader.module.css";

export function DashboardStatusRail({
  daysUntilAccreditation,
  dailyStudySeconds,
  todayStudySeconds,
  remainingStudySeconds,
  currentTaskEstimatedMinutes,
  isTodayStudyDay,
}: {
  daysUntilAccreditation: number | null;
  dailyStudySeconds: number;
  todayStudySeconds: number;
  remainingStudySeconds: number;
  currentTaskEstimatedMinutes: number | null;
  isTodayStudyDay: boolean;
}) {
  return (
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
  );
}
