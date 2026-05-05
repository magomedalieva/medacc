import { StatusBadge } from "./StatusBadge";
import styles from "./ResultFeedbackCard.module.css";

type ResultFeedbackTone = "default" | "accent" | "green" | "warm";

export function ResultFeedbackCard({
  badgeLabel,
  badgeTone,
  description,
  muted = false,
}: {
  badgeLabel: string;
  badgeTone: ResultFeedbackTone;
  description: string;
  muted?: boolean;
}) {
  return (
    <article className={`${styles.card} ${muted ? styles.muted : ""}`.trim()}>
      <StatusBadge label={badgeLabel} tone={badgeTone} />
      <p className={styles.description}>{description}</p>
    </article>
  );
}
