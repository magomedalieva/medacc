import styles from "./SkeletonBlock.module.css";

type SkeletonVariant = "small" | "medium" | "large";

export function SkeletonBlock({ variant = "medium" }: { variant?: SkeletonVariant }) {
  return <div className={`${styles.block} ${styles[variant]}`} />;
}
