import styles from "./SegmentedTabs.module.css";

export function SegmentedTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.tabs} role="tablist">
      {items.map((item) => (
        <button
          aria-selected={value === item.value}
          className={`${styles.tab} ${value === item.value ? styles.active : ""}`.trim()}
          key={item.value}
          onClick={() => onChange(item.value)}
          role="tab"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
