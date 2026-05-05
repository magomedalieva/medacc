import styles from "./DashboardNotice.module.css";

type DashboardNoticeTone = "success" | "danger";

function NoticeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 14 14">
      <circle
        cx="7"
        cy="7"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M7 4.5v3M7 9.5v.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function DashboardNotice({
  message,
  tone,
  onClose,
}: {
  message: string;
  tone: DashboardNoticeTone;
  onClose: () => void;
}) {
  return (
    <div className={`${styles.notice} ${styles[tone]}`}>
      <span className={styles.icon}>
        <NoticeIcon />
      </span>
      <span className={styles.message}>{message}</span>
      <button
        aria-label="Закрыть уведомление"
        className={styles.close}
        onClick={onClose}
        type="button"
      >
        &#x2715;
      </button>
    </div>
  );
}
