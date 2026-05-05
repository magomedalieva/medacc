import type { ReactNode } from "react";

import styles from "./MetaLabel.module.css";

export function MetaLabel({ children }: { children: ReactNode }) {
  return <div className={styles.label}>{children}</div>;
}
