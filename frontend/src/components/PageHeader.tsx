import type { ReactNode } from "react";

import styles from "./PageHeader.module.css";

export function PageHeader({
  title,
  subtitle,
  aside,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className={styles.shell}>
      <div className={styles.content}>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {aside ? <div className={styles.aside}>{aside}</div> : null}
    </section>
  );
}
