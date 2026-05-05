import type { ReactNode } from "react";

import styles from "./SectionTitle.module.css";

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className={styles.title}>{children}</h2>;
}
