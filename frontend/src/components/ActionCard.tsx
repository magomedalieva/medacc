import { Button } from "./Button";
import styles from "./ActionCard.module.css";

type ActionCardTone = "default" | "accent";

export function ActionCard({
  title,
  description,
  actionLabel,
  onAction,
  disabled = false,
  pending = false,
  pendingLabel,
  tone = "default",
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  pending?: boolean;
  pendingLabel?: string;
  tone?: ActionCardTone;
}) {
  return (
    <article className={`${styles.card} ${styles[tone]}`}>
      <div className={styles.title}>{title}</div>
      <p className={styles.description}>{description}</p>
      <Button disabled={disabled || pending} onClick={onAction} variant="primary" withArrow>
        {pending ? pendingLabel ?? actionLabel : actionLabel}
      </Button>
    </article>
  );
}
