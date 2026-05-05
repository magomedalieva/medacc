import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { LoadingScreen } from "./components/LoadingScreen";
import { useAuth } from "./contexts/AuthContext";
import {
  loadAdminContentCoveragePageModule,
  loadAdminCasesPageModule,
  loadAdminOscePageModule,
  loadAdminQuestionsPageModule,
  loadAdminStudentsPageModule,
  loadAnalyticsPageModule,
  loadAppShellModule,
  loadAccreditationPageModule,
  loadAuthPageModule,
  loadCasesPageModule,
  loadDashboardPageModule,
  loadNotificationsPageModule,
  loadOnboardingPageModule,
  loadOscePageModule,
  loadOsceStationPageModule,
  loadPracticePageModule,
  loadSettingsPageModule,
  loadSchedulePageModule,
  loadStaffShellModule,
  loadTestSessionPageModule,
} from "./lib/routePrefetch";

const AppShell = lazy(async () => ({ default: (await loadAppShellModule()).AppShell }));
const StaffShell = lazy(async () => ({ default: (await loadStaffShellModule()).StaffShell }));
const AdminContentCoveragePage = lazy(async () => ({
  default: (await loadAdminContentCoveragePageModule()).AdminContentCoveragePage,
}));
const AdminCasesPage = lazy(async () => ({ default: (await loadAdminCasesPageModule()).AdminCasesPage }));
const AdminOscePage = lazy(async () => ({ default: (await loadAdminOscePageModule()).AdminOscePage }));
const AdminQuestionsPage = lazy(async () => ({ default: (await loadAdminQuestionsPageModule()).AdminQuestionsPage }));
const AdminStudentsPage = lazy(async () => ({ default: (await loadAdminStudentsPageModule()).AdminStudentsPage }));
const AccreditationPage = lazy(async () => ({ default: (await loadAccreditationPageModule()).AccreditationPage }));
const AnalyticsPage = lazy(async () => ({ default: (await loadAnalyticsPageModule()).AnalyticsPage }));
const AuthPage = lazy(async () => ({ default: (await loadAuthPageModule()).AuthPage }));
const CasesPage = lazy(async () => ({ default: (await loadCasesPageModule()).CasesPage }));
const DashboardPage = lazy(async () => ({ default: (await loadDashboardPageModule()).DashboardPage }));
const NotificationsPage = lazy(async () => ({ default: (await loadNotificationsPageModule()).NotificationsPage }));
const OnboardingPage = lazy(async () => ({ default: (await loadOnboardingPageModule()).OnboardingPage }));
const OscePage = lazy(async () => ({ default: (await loadOscePageModule()).OscePage }));
const OsceStationPage = lazy(async () => ({ default: (await loadOsceStationPageModule()).OsceStationPage }));
const PracticePage = lazy(async () => ({ default: (await loadPracticePageModule()).PracticePage }));
const SettingsPage = lazy(async () => ({ default: (await loadSettingsPageModule()).SettingsPage }));
const SchedulePage = lazy(async () => ({ default: (await loadSchedulePageModule()).SchedulePage }));
const TestSessionPage = lazy(async () => ({ default: (await loadTestSessionPageModule()).TestSessionPage }));

function ScreenBoundary({
  children,
  label = "Загружаем интерфейс",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return <Suspense fallback={<LoadingScreen label={label} />}>{children}</Suspense>;
}

function AppEntry() {
  const { status, isAuthenticated, user } = useAuth();

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate replace to="/auth" />;
  }

  if (user.role === "admin") {
    return <Navigate replace to="/staff/coverage" />;
  }

  if (!user.onboarding_completed) {
    return <Navigate replace to="/app/onboarding" />;
  }

  return <Navigate replace to="/app/dashboard" />;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { status, isAuthenticated } = useAuth();

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (isAuthenticated) {
    return <Navigate replace to="/" />;
  }

  return <>{children}</>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, isAuthenticated } = useAuth();

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate replace to="/auth" />;
  }

  return <>{children}</>;
}

function StudentOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  if (user.role === "admin") {
    return <Navigate replace to="/staff/coverage" />;
  }

  return <>{children}</>;
}

function StudentReady({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  if (user.role === "admin") {
    return <Navigate replace to="/staff/coverage" />;
  }

  if (!user.onboarding_completed) {
    return <Navigate replace to="/app/onboarding" />;
  }

  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  if (user.role !== "admin") {
    return <Navigate replace to="/app/dashboard" />;
  }

  return <>{children}</>;
}

function OnboardingOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  if (user.role === "admin") {
    return <Navigate replace to="/staff/coverage" />;
  }

  if (user.onboarding_completed) {
    return <Navigate replace to="/app/dashboard" />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppEntry />} />
      <Route
        path="/auth"
        element={
          <PublicOnly>
            <ScreenBoundary label="Загружаем вход">
              <AuthPage />
            </ScreenBoundary>
          </PublicOnly>
        }
      />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <StudentOnly>
              <ScreenBoundary label="Загружаем рабочее пространство">
                <AppShell />
              </ScreenBoundary>
            </StudentOnly>
          </RequireAuth>
        }
      >
        <Route index element={<AppEntry />} />
        <Route
          path="onboarding"
          element={
            <OnboardingOnly>
              <ScreenBoundary label="Загружаем онбординг">
                <OnboardingPage />
              </ScreenBoundary>
            </OnboardingOnly>
          }
        />
        <Route
          path="dashboard"
          element={
            <StudentReady>
              <ScreenBoundary label="Загружаем дашборд">
                <DashboardPage />
              </ScreenBoundary>
            </StudentReady>
          }
        />
        <Route
          path="accreditation"
          element={
            <StudentReady>
              <ScreenBoundary label="Загружаем аккредитационный центр">
                <AccreditationPage />
              </ScreenBoundary>
            </StudentReady>
          }
        />
        <Route
          path="cases"
          element={
            <StudentReady>
              <ScreenBoundary label="Загружаем кейсы">
                <CasesPage />
              </ScreenBoundary>
            </StudentReady>
          }
        />
        <Route
          path="osce"
          element={
            <StudentReady>
              <ScreenBoundary label="Загружаем ОСКЭ">
                <OscePage />
              </ScreenBoundary>
            </StudentReady>
          }
        />
        <Route
          path="osce/:slug"
          element={
            <StudentReady>
              <ScreenBoundary label="Загружаем станцию ОСКЭ">
                <OsceStationPage />
              </ScreenBoundary>
            </StudentReady>
          }
        />
        <Route
          path="practice"
          element={
            <StudentReady>
              <ScreenBoundary label="Загружаем практику">
                <PracticePage />
              </ScreenBoundary>
            </StudentReady>
          }
        />
        <Route
          path="settings"
          element={
            <StudentReady>
              <ScreenBoundary label="Загружаем настройки аккаунта">
                <SettingsPage />
              </ScreenBoundary>
            </StudentReady>
          }
        />
        <Route
          path="notifications"
          element={
            <StudentReady>
              <ScreenBoundary label="Загружаем уведомления">
                <NotificationsPage />
              </ScreenBoundary>
            </StudentReady>
          }
        />
        <Route
          path="schedule"
          element={
            <StudentReady>
              <ScreenBoundary label="Загружаем план">
                <SchedulePage />
              </ScreenBoundary>
            </StudentReady>
          }
        />
        <Route
          path="analytics"
          element={
            <StudentReady>
              <ScreenBoundary label="Загружаем статистику">
                <AnalyticsPage />
              </ScreenBoundary>
            </StudentReady>
          }
        />
        <Route
          path="tests/:sessionId"
          element={
            <StudentReady>
              <ScreenBoundary label="Загружаем сессию">
                <TestSessionPage />
              </ScreenBoundary>
            </StudentReady>
          }
        />
      </Route>
      <Route
        path="/staff"
        element={
          <RequireAuth>
            <AdminOnly>
              <ScreenBoundary label="Загружаем рабочее пространство администратора">
                <StaffShell />
              </ScreenBoundary>
            </AdminOnly>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate replace to="/staff/coverage" />} />
        <Route
          path="coverage"
          element={
            <ScreenBoundary label="Загружаем покрытие контента">
              <AdminContentCoveragePage />
            </ScreenBoundary>
          }
        />
        <Route
          path="students"
          element={
            <ScreenBoundary label="Загружаем студентов">
              <AdminStudentsPage />
            </ScreenBoundary>
          }
        />
        <Route
          path="cases"
          element={
            <ScreenBoundary label="Загружаем админ-панель кейсов">
              <AdminCasesPage />
            </ScreenBoundary>
          }
        />
        <Route
          path="osce"
          element={
            <ScreenBoundary label="Загружаем админ-панель ОСКЭ">
              <AdminOscePage />
            </ScreenBoundary>
          }
        />
        <Route
          path="questions"
          element={
            <ScreenBoundary label="Загружаем админ-панель вопросов">
              <AdminQuestionsPage />
            </ScreenBoundary>
          }
        />
      </Route>
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}
