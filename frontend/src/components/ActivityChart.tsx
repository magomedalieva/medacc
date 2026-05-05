import styles from "./ActivityChart.module.css";

function normalizeHeight(value: number, maxValue: number): string {
  if (maxValue <= 0 || value <= 0) {
    return "0%";
  }

  return `${Math.max((value / maxValue) * 100, 14)}%`;
}

export function ActivityChart({
  items,
}: {
  items: Array<{ label: string; value: number }>;
}) {
  const maxValue = Math.max(...items.map((item) => item.value), 0);

  return (
    <div className={styles.list}>
      {items.map((item) => (
        <article className={styles.item} key={item.label}>
          <div className={styles.track}>
            <div
              className={styles.fill}
              data-empty={item.value <= 0 ? "true" : undefined}
              style={{ height: normalizeHeight(item.value, maxValue) }}
            />
          </div>
          <div className={styles.value}>{item.value}</div>
          <div className={styles.label}>{item.label}</div>
        </article>
      ))}
    </div>
  );
}
