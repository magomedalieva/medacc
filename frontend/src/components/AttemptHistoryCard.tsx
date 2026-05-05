import { StatusBadge } from "./StatusBadge";
import styles from "./AttemptHistoryCard.module.css";

type AttemptHistoryTone = "default" | "accent" | "green" | "warm";

export function AttemptHistoryCard({
  dateLabel,
  scoreLabel,
  badgeLabel,
  badgeTone,
  checklistLabel,
  quizLabel,
}: {
  dateLabel: string;
  scoreLabel: string;
  badgeLabel: string;
  badgeTone: AttemptHistoryTone;
  checklistLabel: string;
  quizLabel: string;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <div className={styles.copy}>
          <div className={styles.date}>{dateLabel}</div>
          <div className={styles.score}>{scoreLabel}</div>
        </div>
        <StatusBadge label={badgeLabel} tone={badgeTone} />
      </div>
      <div className={styles.meta}>
        <span>Чек-лист <strong>{checklistLabel}</strong></span>
        <span>Мини-тест <strong>{quizLabel}</strong></span>
      </div>
    </article>
  );
}
