import type { ReactNode } from "react";

import { LinkButton } from "./LinkButton";
import { Wrapper } from "./Wrapper";
import styles from "./EmptyStateCard.module.css";

export function EmptyStateCard({
  title,
  description,
  actionLabel,
  actionTo,
  leading,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
  leading?: ReactNode;
}) {
  return (
    <div className={styles.card}>
      {leading ? <Wrapper>{leading}</Wrapper> : null}
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {actionLabel && actionTo ? <LinkButton to={actionTo} variant="primary">{actionLabel}</LinkButton> : null}
    </div>
  );
}
