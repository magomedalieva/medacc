import { percentage } from "../lib/format";
import styles from "./TopicProgressCard.module.css";

function toneForStatus(status: string) {
  if (status === "not_started" || status === "new") {
    return "default";
  }

  if (status === "weak") {
    return "accent";
  }

  if (status === "medium") {
    return "warm";
  }

  return "green";
}

export function TopicProgressCard({
  label,
  caption,
  accuracyPercent,
  status,
}: {
  label: string;
  caption: string;
  accuracyPercent: number;
  status: string;
}) {
  const tone = toneForStatus(status);
  const fillClass =
    tone === "accent"
      ? styles.accentFill
      : tone === "warm"
        ? styles.warmFill
        : tone === "green"
          ? styles.greenFill
          : styles.defaultFill;
  const normalizedAccuracy = Math.max(0, Math.min(100, accuracyPercent));
  const progressWidth = normalizedAccuracy > 0 ? Math.max(normalizedAccuracy, 4) : 0;

  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <div className={styles.copy}>
          <div className={styles.title}>{label}</div>
          <div className={styles.caption}>{caption}</div>
        </div>
        <div className={`${styles.value} ${styles[tone]}`}>{percentage(accuracyPercent)}</div>
      </div>
      <div className={styles.bar}>
        <div className={`${styles.fill} ${fillClass}`} style={{ width: `${progressWidth}%` }} />
      </div>
    </article>
  );
}
