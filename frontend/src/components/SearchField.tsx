import type { InputHTMLAttributes } from "react";

import styles from "./Field.module.css";

type SearchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "style" | "type"> & {
  label: string;
};

export function SearchField({ label, ...props }: SearchFieldProps) {
  return (
    <label className={styles.searchShell}>
      <span className={styles.searchLabel}>{label}</span>
      <input className={styles.searchInput} type="search" {...props} />
    </label>
  );
}
