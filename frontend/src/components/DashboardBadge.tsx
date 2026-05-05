import type { ReactNode } from "react";

import styles from "./DashboardBadge.module.css";

export type DashboardTone = "default" | "accent" | "green" | "gold";

const pulseToneClass: Record<Exclude<DashboardTone, "default">, string> = {
  accent: styles.pulseAccent,
  green: styles.pulseGreen,
  gold: styles.pulseGold,
};

export function DashboardBadge({
  children,
  tone = "default",
  pulseTone,
}: {
  children: ReactNode;
  tone?: DashboardTone;
  pulseTone?: Exclude<DashboardTone, "default">;
}) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {pulseTone ? (
        <span
          aria-hidden="true"
          className={`${styles.pulse} ${pulseToneClass[pulseTone]}`}
        />
      ) : null}
      {children}
    </span>
  );
}
