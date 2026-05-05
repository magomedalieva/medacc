import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { initials } from "../lib/format";
import { getRoutePrefetchProps } from "../lib/routePrefetch";
import styles from "./StaffShell.module.css";

const navigation = [
  { to: "/staff/coverage", label: "Покрытие" },
  { to: "/staff/students", label: "Студенты" },
  { to: "/staff/questions", label: "Вопросы" },
  { to: "/staff/cases", label: "Кейсы" },
  { to: "/staff/osce", label: "ОСКЭ" },
] as const;

export function StaffShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return null;
  }

  async function handleLogout() {
    await logout();
    navigate("/auth", { replace: true });
  }

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <NavLink className={styles.logo} to="/staff/coverage" {...getRoutePrefetchProps("/staff/coverage")}>
              <span className={styles.logoText}>MedAcc</span>
            </NavLink>

            <nav className={styles.nav} aria-label="Навигация администратора">
              {navigation.map((item) => (
                <NavLink
                  key={item.to}
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`.trim()}
                  to={item.to}
                  {...getRoutePrefetchProps(item.to)}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className={styles.headerRight}>
            <div className={styles.userChip}>
              <span className={styles.userAvatar}>{initials(user.first_name, user.last_name)}</span>
              <div className={styles.userMeta}>
                <span className={styles.userName} title={`${user.first_name} ${user.last_name}`}>
                  {user.first_name} {user.last_name}
                </span>
                <span className={styles.userRole}>Администратор</span>
              </div>
            </div>

            <button className={styles.logoutButton} data-testid="staff-logout" onClick={() => void handleLogout()} type="button">
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
