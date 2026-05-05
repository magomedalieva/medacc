import type { ReactNode } from "react";

import styles from "./ActionRowCard.module.css";

export function ActionRowCard({
  title,
  meta,
  actions,
}: {
  title: ReactNode;
  meta: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <article className={styles.card}>
      <div className={styles.copy}>
        <div className={styles.title}>{title}</div>
        <div className={styles.meta}>{meta}</div>
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </article>
  );
}
