import styles from "./LoadingScreen.module.css";

export function LoadingScreen({ label = "Загружаем интерфейс" }: { label?: string }) {
  return (
    <div className={styles.shell}>
      <div className={styles.card}>
        <div className={styles.title}>{label}</div>
        <div className={styles.track}>
          <div className={styles.fill} />
        </div>
      </div>
    </div>
  );
}
