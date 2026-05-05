import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { useAuth } from "./AuthContext";
import styles from "./NotificationContext.module.css";

export type NotificationTone = "default" | "success" | "danger" | "warm";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  tone: NotificationTone;
  created_at: string;
  day_key: string;
  read: boolean;
};

type NotificationPayload = {
  title?: string;
  message: string;
  tone?: NotificationTone;
};

type NotificationContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  addNotification: (payload: NotificationPayload) => string | null;
  closeToast: (id: string) => void;
  markAllRead: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);
const TOAST_LIFETIME_MS = 15_000;

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function storageKey(userId: number, dayKey: string): string {
  return `medacc.notifications.${userId}.${dayKey}`;
}

function notificationTitle(tone: NotificationTone): string {
  if (tone === "success") {
    return "Готово";
  }

  if (tone === "danger") {
    return "Нужно внимание";
  }

  if (tone === "warm") {
    return "План обновлён";
  }

  return "Уведомление";
}

function toastClassName(tone: NotificationTone): string {
  return [styles.toast, tone !== "default" ? styles[tone] : ""].filter(Boolean).join(" ");
}

function normalizeStoredNotifications(value: unknown): NotificationItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is NotificationItem => {
    if (!item || typeof item !== "object") {
      return false;
    }

    const candidate = item as Partial<NotificationItem>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.title === "string" &&
      typeof candidate.message === "string" &&
      typeof candidate.created_at === "string" &&
      typeof candidate.day_key === "string" &&
      typeof candidate.read === "boolean"
    );
  });
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const dayKey = user?.server_today ?? localDayKey(new Date());
  const key = user ? storageKey(user.id, dayKey) : null;
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [visibleToasts, setVisibleToasts] = useState<NotificationItem[]>([]);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    setPortalTarget(document.body);
  }, []);

  useEffect(() => {
    setVisibleToasts([]);
    skipNextSaveRef.current = true;

    if (!key) {
      setNotifications([]);
      return;
    }

    try {
      const rawValue = window.localStorage.getItem(key);
      const parsedValue = rawValue ? JSON.parse(rawValue) : [];
      setNotifications(normalizeStoredNotifications(parsedValue));
    } catch {
      setNotifications([]);
    }
  }, [key]);

  useEffect(() => {
    if (!key) {
      return;
    }

    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(notifications));
    } catch {
      // Notification history is a comfort feature; storage errors should not break study flows.
    }
  }, [key, notifications]);

  const closeToast = useCallback((id: string) => {
    const timer = timersRef.current[id];

    if (timer) {
      clearTimeout(timer);
      delete timersRef.current[id];
    }

    setVisibleToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const addNotification = useCallback(
    ({ title, message, tone = "default" }: NotificationPayload) => {
      if (!user) {
        return null;
      }

      const now = new Date();
      const item: NotificationItem = {
        id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
        title: title ?? notificationTitle(tone),
        message,
        tone,
        created_at: now.toISOString(),
        day_key: dayKey,
        read: false,
      };

      setNotifications((current) => [item, ...current].slice(0, 80));
      setVisibleToasts((current) => [item, ...current].slice(0, 3));

      timersRef.current[item.id] = setTimeout(() => closeToast(item.id), TOAST_LIFETIME_MS);

      return item.id;
    },
    [closeToast, dayKey, user],
  );

  const markAllRead = useCallback(() => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
  }, []);

  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach((timer) => clearTimeout(timer));
      timersRef.current = {};
    };
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount: notifications.filter((item) => !item.read).length,
      addNotification,
      closeToast,
      markAllRead,
    }),
    [addNotification, closeToast, markAllRead, notifications],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {portalTarget
        ? createPortal(
            <div aria-live="polite" className={styles.toastShelf}>
              {visibleToasts.map((toast) => (
                <article className={toastClassName(toast.tone)} key={toast.id} role="status">
                  <span aria-hidden="true" className={styles.dot} />
                  <div className={styles.copy}>
                    <div className={styles.title}>{toast.title}</div>
                    <div className={styles.message}>{toast.message}</div>
                  </div>
                  <button
                    aria-label="Закрыть уведомление"
                    className={styles.close}
                    onClick={() => closeToast(toast.id)}
                    type="button"
                  >
                    ×
                  </button>
                </article>
              ))}
            </div>,
            portalTarget,
          )
        : null}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);

  if (!context) {
    throw new Error("useNotifications must be used inside NotificationProvider");
  }

  return context;
}
