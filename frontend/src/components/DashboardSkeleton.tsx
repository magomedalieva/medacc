import styles from "./DashboardSkeleton.module.css";

export function DashboardSkeleton() {
  return (
    <div className={styles.grid}>
      <div className={styles.column}>
        <div className={`${styles.block} ${styles.large}`} />
        <div className={`${styles.block} ${styles.medium}`} />
      </div>
      <div className={styles.column}>
        <div className={`${styles.block} ${styles.small}`} />
        <div className={`${styles.block} ${styles.large}`} />
      </div>
    </div>
  );
}
