import type { ReactNode } from "react";

import styles from "./FormCard.module.css";

export function FormCard({
  eyebrow,
  title,
  subtitle,
  headerAside,
  footer,
  children,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  headerAside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className={styles.card}>
      {eyebrow || title || subtitle || headerAside ? (
        <div className={styles.header}>
          <div className={styles.copy}>
            {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
            {title ? <h2 className={styles.title}>{title}</h2> : null}
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          {headerAside ? <div className={styles.aside}>{headerAside}</div> : null}
        </div>
      ) : null}
      <div className={styles.body}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </article>
  );
}
