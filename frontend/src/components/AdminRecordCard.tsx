import type { ReactNode } from "react";

import styles from "./AdminRecordCard.module.css";

export function AdminRecordCard({
  title,
  subtitle,
  meta,
  description,
  badges,
  actions,
  extra,
}: {
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.head}>
        <div className={styles.copy}>
          <div className={styles.title}>{title}</div>
          {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
          {meta ? <div className={styles.meta}>{meta}</div> : null}
        </div>
        {badges ? <div className={styles.badges}>{badges}</div> : null}
      </div>
      {description ? <div className={styles.description}>{description}</div> : null}
      {extra ? <div className={styles.extra}>{extra}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </article>
  );
}
