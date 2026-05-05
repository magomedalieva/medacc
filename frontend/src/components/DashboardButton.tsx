import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./DashboardButton.module.css";

type DashboardButtonVariant = "primary" | "outline" | "ghost" | "link";
type DashboardButtonSize = "default" | "small";
type DashboardButtonIconMotion = "none" | "forward";

export function DashboardButton({
  children,
  variant = "outline",
  size = "default",
  leadingIcon,
  trailingIcon,
  iconMotion = "none",
  loading = false,
  fullWidth = false,
  type = "button",
  disabled,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> & {
  children: ReactNode;
  variant?: DashboardButtonVariant;
  size?: DashboardButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  iconMotion?: DashboardButtonIconMotion;
  loading?: boolean;
  fullWidth?: boolean;
}) {
  const className = [
    styles.button,
    styles[variant],
    styles[size],
    iconMotion === "forward" ? styles.motionForward : "",
    fullWidth ? styles.fullWidth : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={className}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? <span aria-hidden="true" className={styles.spinner} /> : null}
      {!loading && leadingIcon ? (
        <span aria-hidden="true" className={styles.icon}>
          {leadingIcon}
        </span>
      ) : null}
      <span className={styles.label}>{children}</span>
      {!loading && trailingIcon ? (
        <span aria-hidden="true" className={styles.icon}>
          {trailingIcon}
        </span>
      ) : null}
    </button>
  );
}
