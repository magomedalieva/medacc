import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import styles from "./ChecklistItemCard.module.css";

export function ChecklistItemCard({
  title,
  description,
  checked,
  critical = false,
  expanded = false,
  onToggleChecked,
  onToggleExpanded,
}: {
  title: string;
  description: string;
  checked: boolean;
  critical?: boolean;
  expanded?: boolean;
  onToggleChecked: () => void;
  onToggleExpanded: () => void;
}) {
  return (
    <article className={`${styles.card} ${checked ? styles.selected : ""}`.trim()}>
      <div className={styles.head}>
        <label className={styles.toggle}>
          <input checked={checked} onChange={onToggleChecked} type="checkbox" />
          <span>{title}</span>
        </label>
        <div className={styles.actions}>
          {critical ? <StatusBadge label="Критично" tone="accent" /> : null}
          <Button onClick={onToggleExpanded} size="small" variant="quiet">
            {expanded ? "Скрыть" : "Описание"}
          </Button>
        </div>
      </div>
      {expanded ? <div className={styles.description}>{description}</div> : null}
    </article>
  );
}
