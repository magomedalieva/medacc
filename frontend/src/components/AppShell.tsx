import { Outlet, useLocation } from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";
import { StudentTopNav } from "./StudentTopNav";
import styles from "./AppShell.module.css";

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return null;
  }

  const isStandaloneStudentScreen =
    location.pathname === "/app/onboarding" ||
    location.pathname === "/app/practice" ||
    location.pathname.startsWith("/app/accreditation/cases") ||
    location.pathname.startsWith("/app/accreditation/osce") ||
    location.pathname === "/app/cases" ||
    location.pathname.startsWith("/app/osce") ||
    location.pathname.startsWith("/app/tests/");

  if (isStandaloneStudentScreen) {
    return <Outlet />;
  }

  return (
    <div className={styles.shell}>
      <StudentTopNav />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
