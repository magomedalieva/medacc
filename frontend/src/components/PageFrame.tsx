import type { ReactNode } from "react";

import styles from "./PageFrame.module.css";

type PageFrameSize = "default" | "compact";

export function PageFrame({
  children,
  size = "default",
}: {
  children: ReactNode;
  size?: PageFrameSize;
}) {
  return <div className={`${styles.frame} ${styles[size]}`}>{children}</div>;
}
