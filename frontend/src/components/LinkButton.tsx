import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { getRoutePrefetchProps } from "../lib/routePrefetch";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "quiet";
type ButtonSize = "small" | "medium";

export function LinkButton({
  to,
  children,
  variant = "secondary",
  size = "medium",
  fullWidth = false,
  withArrow = false,
}: {
  to: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  withArrow?: boolean;
}) {
  const className = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Link className={className} to={to} {...getRoutePrefetchProps(to)}>
      {children}
      {withArrow ? <span className={styles.arrow} aria-hidden="true">→</span> : null}
    </Link>
  );
}
