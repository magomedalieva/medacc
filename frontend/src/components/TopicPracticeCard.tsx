import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import styles from "./TopicPracticeCard.module.css";

type TopicPracticeTone = "default" | "accent" | "green" | "warm";

export function TopicPracticeCard({
  title,
  section,
  description,
  statusLabel,
  statusTone,
  actionLabel,
  onAction,
  pending = false,
}: {
  title: string;
  section: string;
  description: string;
  statusLabel: string;
  statusTone: TopicPracticeTone;
  actionLabel: string;
  onAction: () => void;
  pending?: boolean;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <div className={styles.copy}>
          <div className={styles.title}>{title}</div>
          <div className={styles.section}>{section}</div>
        </div>
        <StatusBadge label={statusLabel} tone={statusTone} />
      </div>
      <p className={styles.description}>{description}</p>
      <Button disabled={pending} onClick={onAction} variant="secondary">
        {actionLabel}
      </Button>
    </article>
  );
}
