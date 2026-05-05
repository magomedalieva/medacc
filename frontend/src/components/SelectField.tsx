import type { ReactNode, SelectHTMLAttributes } from "react";

import styles from "./Field.module.css";

type NativeSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "style" | "children">;

export function SelectField({
  label,
  children,
  ...props
}: NativeSelectProps & {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <select className={styles.select} {...props}>
        {children}
      </select>
    </label>
  );
}
