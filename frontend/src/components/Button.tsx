import type { ButtonHTMLAttributes, ReactNode } from "react";

import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "quiet";
type ButtonSize = "small" | "medium";

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style"> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  withArrow?: boolean;
};

export function Button({
  children,
  variant = "secondary",
  size = "medium",
  fullWidth = false,
  withArrow = false,
  type = "button",
  ...props
}: ButtonProps) {
  const className = [
    styles.button,
    styles[variant],
    styles[size],
    fullWidth ? styles.fullWidth : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={className} type={type} {...props}>
      {children}
      {withArrow ? <span className={styles.arrow} aria-hidden="true">→</span> : null}
    </button>
  );
}
