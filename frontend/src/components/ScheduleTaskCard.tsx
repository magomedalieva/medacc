import type { ReactNode } from "react";

import { StatusBadge } from "./StatusBadge";
import styles from "./ScheduleTaskCard.module.css";

type StatusTone = "default" | "accent" | "green" | "warm";

type Marker = {
  label: string;
  tone: StatusTone;
};

export function ScheduleTaskCard({
  title,
  meta,
  reason,
  note,
  markers,
  actions,
  muted = false,
  testId,
}: {
  title: string;
  meta: string;
  reason?: string | null;
  note?: string | null;
  markers: Marker[];
  actions: ReactNode;
  muted?: boolean;
  testId?: string;
}) {
  return (
    <article className={`${styles.card} ${muted ? styles.muted : ""}`} data-testid={testId}>
      <div className={styles.main}>
        {markers.length > 0 ? (
          <div className={styles.badges}>
            {markers.map((marker) => (
              <StatusBadge key={marker.label} label={marker.label} tone={marker.tone} />
            ))}
          </div>
        ) : null}
        <div className={styles.title}>{title}</div>
        <div className={styles.meta}>{meta}</div>
        {reason ? <div className={styles.reason}>{reason}</div> : null}
        {note ? <div className={styles.note}>{note}</div> : null}
      </div>
      <div className={styles.actions}>{actions}</div>
    </article>
  );
}
