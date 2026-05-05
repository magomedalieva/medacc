import { Button } from "./Button";
import styles from "./CaseRouteCard.module.css";

export function CaseRouteCard({
  dateLabel,
  title,
  description,
  onOpen,
  pending = false,
}: {
  dateLabel: string;
  title: string;
  description: string;
  onOpen: () => void;
  pending?: boolean;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.date}>{dateLabel}</div>
      <div className={styles.title}>{title}</div>
      <p className={styles.description}>{description}</p>
      <Button disabled={pending} onClick={onOpen} size="small" variant="quiet">
        {pending ? "Открываем..." : "Открыть"}
      </Button>
    </article>
  );
}
