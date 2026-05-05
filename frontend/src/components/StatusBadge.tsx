import styles from "./StatusBadge.module.css";

type StatusTone = "default" | "accent" | "green" | "warm";
type StatusSize = "default" | "compact";

export function StatusBadge({
  label,
  tone = "default",
  size = "default",
}: {
  label: string;
  tone?: StatusTone;
  size?: StatusSize;
}) {
  return <span className={`${styles.badge} ${styles[tone]} ${size === "compact" ? styles.compact : ""}`}>{label}</span>;
}
