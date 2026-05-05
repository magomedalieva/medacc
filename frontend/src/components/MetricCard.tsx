import styles from "./MetricCard.module.css";

type MetricTone = "default" | "accent" | "green" | "warm";

export function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: MetricTone;
}) {
  return (
    <article className={`${styles.card} ${styles[tone]}`}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
    </article>
  );
}
