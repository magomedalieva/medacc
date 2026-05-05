import type { TextareaHTMLAttributes } from "react";

import styles from "./Field.module.css";

type NativeTextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "style">;

export function TextAreaField({
  label,
  ...props
}: NativeTextAreaProps & {
  label: string;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <textarea className={styles.textarea} {...props} />
    </label>
  );
}
