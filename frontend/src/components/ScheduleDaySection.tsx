import type { ReactNode } from "react";

import { StatusBadge } from "./StatusBadge";
import styles from "./ScheduleDaySection.module.css";

type MarkerTone = "default" | "accent" | "green" | "warm";

export function ScheduleDaySection({
  title,
  markers,
  children,
}: {
  title: string;
  markers: Array<{ label: string; tone: MarkerTone }>;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {markers.length > 0 ? (
          <div className={styles.markers}>
            {markers.map((marker) => (
              <StatusBadge key={marker.label} label={marker.label} tone={marker.tone} />
            ))}
          </div>
        ) : null}
      </div>
      <div className={styles.content}>{children}</div>
    </section>
  );
}
