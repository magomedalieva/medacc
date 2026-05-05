import type { InputHTMLAttributes } from "react";

import styles from "./Field.module.css";

type NativeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "style">;

export function TextField({
  label,
  type = "text",
  ...props
}: NativeInputProps & {
  label: string;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input className={styles.control} type={type} {...props} />
    </label>
  );
}
