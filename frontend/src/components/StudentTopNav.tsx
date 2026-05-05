import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { useNotifications } from "../contexts/NotificationContext";
import { initials } from "../lib/format";
import { getRoutePrefetchProps } from "../lib/routePrefetch";
import styles from "./StudentTopNav.module.css";

const studentNavigation = [
  { to: "/app/dashboard", label: "Кабинет" },
  { to: "/app/practice", label: "Тесты" },
  { to: "/app/cases", label: "Кейсы" },
  { to: "/app/osce", label: "ОСКЭ" },
  { to: "/app/accreditation", label: "Аккредитация" },
  { to: "/app/schedule", label: "Планировщик" },
  { to: "/app/analytics", label: "Аналитика" },
] as const;

function isNavigationActive(pathname: string, target: (typeof studentNavigation)[number]["to"]): boolean {
  if (target === "/app/dashboard") {
    return pathname === target;
  }

  if (target === "/app/practice") {
    return pathname === target || pathname.startsWith("/app/tests/");
  }

  if (target === "/app/osce") {
    return pathname === target || pathname.startsWith("/app/osce/");
  }

  return pathname === target;
}

export function StudentTopNav() {
  const { user, logout } = useAuth();
  const { unreadCount } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [isProfileMenuOpen, setProfileMenuOpen] = useState(false);
  const isSettingsRoute = location.pathname === "/app/settings";
  const isNotificationsRoute = location.pathname === "/app/notifications";

  useEffect(() => {
    setProfileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return undefined;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isProfileMenuOpen]);

  if (!user) {
    return null;
  }

  async function handleLogout() {
    setProfileMenuOpen(false);
    await logout();
    navigate("/auth", { replace: true });
  }

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <div className={styles.headerLeft}>
          <Link className={styles.logo} to="/app/dashboard" {...getRoutePrefetchProps("/app/dashboard")}>
            <span className={styles.logoText}>MedAcc</span>
          </Link>

          <nav className={styles.nav} aria-label="Основная навигация">
            {studentNavigation.map((item) => (
              <Link
                className={`${styles.navLink} ${isNavigationActive(location.pathname, item.to) ? styles.navLinkActive : ""}`.trim()}
                key={item.to}
                to={item.to}
                {...getRoutePrefetchProps(item.to)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.profileMenu} ref={profileMenuRef}>
            <button
              aria-label="Меню профиля"
              aria-expanded={isProfileMenuOpen}
              aria-haspopup="menu"
              className={`${styles.userChipButton} ${isProfileMenuOpen || isSettingsRoute || isNotificationsRoute ? styles.userChipButtonOpen : ""}`.trim()}
              data-testid="app-profile-menu-trigger"
              onClick={() => setProfileMenuOpen((currentValue) => !currentValue)}
              type="button"
            >
              <span className={styles.userAvatar}>{initials(user.first_name, user.last_name)}</span>
              {unreadCount > 0 ? <span className={styles.userChipBadge}>{Math.min(unreadCount, 9)}</span> : null}
            </button>

            {isProfileMenuOpen ? (
              <div className={styles.profileMenuPanel} role="menu">
                <div className={styles.profileMenuHeader}>
                  <span className={styles.profileMenuEmail}>{user.email}</span>
                </div>

                <Link
                  aria-current={isSettingsRoute ? "page" : undefined}
                  className={`${styles.profileMenuItem} ${isSettingsRoute ? styles.profileMenuItemActive : ""}`.trim()}
                  data-testid="app-profile-settings"
                  role="menuitem"
                  to="/app/settings"
                  {...getRoutePrefetchProps("/app/settings")}
                >
                  Аккаунт
                </Link>

                <Link
                  aria-current={isNotificationsRoute ? "page" : undefined}
                  className={`${styles.profileMenuItem} ${isNotificationsRoute ? styles.profileMenuItemActive : ""}`.trim()}
                  data-testid="app-profile-notifications"
                  role="menuitem"
                  to="/app/notifications"
                  {...getRoutePrefetchProps("/app/notifications")}
                >
                  <span className={styles.profileMenuItemContent}>
                    <span>Уведомления</span>
                    {unreadCount > 0 ? <span className={styles.profileMenuBadge}>{Math.min(unreadCount, 99)}</span> : null}
                  </span>
                </Link>

                <button
                  className={styles.profileMenuItem}
                  data-testid="app-logout"
                  onClick={() => void handleLogout()}
                  role="menuitem"
                  type="button"
                >
                  Выход
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
