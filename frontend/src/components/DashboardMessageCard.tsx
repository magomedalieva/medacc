import styles from "./DashboardMessageCard.module.css";

type DashboardMessageTone = "default" | "success" | "danger";
type DashboardMessageVariant = "summary" | "compact";

export function DashboardMessageCard({
  title,
  message,
  tone = "default",
  variant = "summary",
}: {
  title?: string;
  message: string;
  tone?: DashboardMessageTone;
  variant?: DashboardMessageVariant;
}) {
  return (
    <div className={`${styles.card} ${styles[variant]} ${styles[tone]}`.trim()}>
      {title ? <h3 className={styles.title}>{title}</h3> : null}
      <p className={styles.message}>{message}</p>
    </div>
  );
}
