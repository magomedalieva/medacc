import type { ReactNode } from "react";

import styles from "./DashboardScaffold.module.css";

export function DashboardBodyGrid({ children }: { children: ReactNode }) {
  return <div className={styles.bodyGrid}>{children}</div>;
}

export function DashboardColumn({ children }: { children: ReactNode }) {
  return <div className={styles.column}>{children}</div>;
}

export function DashboardSection({
  title,
  children,
}: {
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      {title ? <h2 className={styles.sectionLabel}>{title}</h2> : null}
      {children}
    </section>
  );
}
