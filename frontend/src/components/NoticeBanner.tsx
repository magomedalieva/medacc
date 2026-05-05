import styles from "./NoticeBanner.module.css";

type NoticeTone = "default" | "danger" | "success";

export function NoticeBanner({
  message,
  tone = "default",
}: {
  message: string;
  tone?: NoticeTone;
}) {
  return <div className={`${styles.banner} ${styles[tone]}`}>{message}</div>;
}
