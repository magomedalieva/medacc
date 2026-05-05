import type { ReactNode } from "react";

import styles from "./DashboardLayout.module.css";

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.shell}>{children}</div>
    </div>
  );
}
