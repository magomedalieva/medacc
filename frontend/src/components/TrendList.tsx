import styles from "./TrendList.module.css";

function normalizeWidth(value: number): string {
  const normalized = Math.max(0, Math.min(value, 100));

  return `${normalized > 0 ? Math.max(normalized, 6) : 0}%`;
}

export function TrendList({
  items,
}: {
  items: Array<{ label: string; value: number; note?: string }>;
}) {
  return (
    <div className={styles.list}>
      {items.map((item) => (
        <article className={styles.item} key={item.label}>
          <div className={styles.label}>{item.label}</div>
          <div className={styles.track}>
            <div className={styles.fill} style={{ width: normalizeWidth(item.value) }} />
          </div>
          <div className={styles.value}>{item.note ?? `${Math.round(item.value)}%`}</div>
        </article>
      ))}
    </div>
  );
}
