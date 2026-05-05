import styles from "./ProgressBar.module.css";

export function ProgressBar({
  value,
  title,
  detail,
}: {
  value: number;
  title?: string;
  detail?: string;
}) {
  const normalized = Math.max(0, Math.min(100, value));

  return (
    <div className={styles.shell}>
      {title || detail ? (
        <div className={styles.head}>
          {title ? <span>{title}</span> : <span />}
          {detail ? <strong>{detail}</strong> : null}
        </div>
      ) : null}
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${Math.max(normalized, normalized > 0 ? 4 : 0)}%` }} />
      </div>
    </div>
  );
}
