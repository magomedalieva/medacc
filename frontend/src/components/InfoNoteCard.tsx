import styles from "./InfoNoteCard.module.css";

export function InfoNoteCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <article className={styles.card}>
      <strong className={styles.title}>{title}</strong>
      <p className={styles.description}>{description}</p>
    </article>
  );
}
