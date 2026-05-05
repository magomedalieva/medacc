import type { ReactNode } from "react";

import { StatusBadge } from "./StatusBadge";
import styles from "./TodayTaskCard.module.css";

type StatusTone = "default" | "accent" | "green" | "warm";

type StatusItem = {
  label: string;
  tone: StatusTone;
};

type MetaItem = {
  label: string;
  value: string;
};

export function TodayTaskCard({
  statuses,
  title,
  description,
  meta,
  actions,
}: {
  statuses: StatusItem[];
  title: string;
  description: string;
  meta: MetaItem[];
  actions: ReactNode;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.statuses}>
        {statuses.map((status) => (
          <StatusBadge key={status.label} label={status.label} tone={status.tone} />
        ))}
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      <div className={styles.meta}>
        {meta.map((item) => (
          <span className={styles.metaItem} key={item.label}>
            {item.label} <span className={styles.metaValue}>{item.value}</span>
          </span>
        ))}
      </div>
      <div className={styles.actions}>{actions}</div>
    </article>
  );
}
