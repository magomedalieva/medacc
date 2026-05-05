import { useEffect } from "react";

import { useNotifications, type NotificationItem } from "../contexts/NotificationContext";
import styles from "./NotificationsPage.module.css";

function formatNotificationTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function itemClassName(item: NotificationItem): string {
  return [styles.item, styles[item.tone], !item.read ? styles.unread : ""].filter(Boolean).join(" ");
}

export function NotificationsPage() {
  const { notifications, markAllRead } = useNotifications();

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  return (
    <main className={styles.shell} data-testid="notifications-page">
      <header className={styles.header}>
        <div>
          <div className={styles.kicker}>Центр событий</div>
          <h1 className={styles.title}>
            Уведомления <em>за день</em>
          </h1>
          <p className={styles.lead}>
            Здесь сохраняются сообщения, которые появились сегодня: изменения плана, переносы задач и важные подсказки системы.
          </p>
        </div>

        <div className={styles.counter}>
          <strong>{notifications.length}</strong>
          <span>сегодня</span>
        </div>
      </header>

      {notifications.length > 0 ? (
        <section className={styles.list} aria-label="Уведомления за сегодня">
          {notifications.map((item) => (
            <article className={itemClassName(item)} key={item.id}>
              <span aria-hidden="true" className={styles.dot} />
              <div className={styles.copy}>
                <div className={styles.itemTitle}>{item.title}</div>
                <div className={styles.message}>{item.message}</div>
              </div>
              <time className={styles.time} dateTime={item.created_at}>
                {formatNotificationTime(item.created_at)}
              </time>
            </article>
          ))}
        </section>
      ) : (
        <section className={styles.empty}>
          <div>
            <strong>Сегодня уведомлений нет</strong>
            <span>Когда планировщик или система подготовки что-то сообщит, запись появится здесь и сохранится до конца дня.</span>
          </div>
        </section>
      )}
    </main>
  );
}
