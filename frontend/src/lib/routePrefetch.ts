type RouteModuleMap = {
  appShell: typeof import("../components/AppShell");
  staffShell: typeof import("../components/StaffShell");
  auth: typeof import("../pages/AuthPage");
  onboarding: typeof import("../pages/OnboardingPage");
  dashboard: typeof import("../pages/DashboardPage");
  accreditation: typeof import("../pages/AccreditationPage");
  cases: typeof import("../pages/CasesPage");
  osce: typeof import("../pages/OscePage");
  osceStation: typeof import("../pages/OsceStationPage");
  practice: typeof import("../pages/PracticePage");
  settings: typeof import("../pages/SettingsPage");
  notifications: typeof import("../pages/NotificationsPage");
  schedule: typeof import("../pages/SchedulePage");
  analytics: typeof import("../pages/AnalyticsPage");
  testSession: typeof import("../pages/TestSessionPage");
  adminContentCoverage: typeof import("../pages/AdminContentCoveragePage");
  adminStudents: typeof import("../pages/AdminStudentsPage");
  adminCases: typeof import("../pages/AdminCasesPage");
  adminOsce: typeof import("../pages/AdminOscePage");
  adminQuestions: typeof import("../pages/AdminQuestionsPage");
};

type RouteModuleKey = keyof RouteModuleMap;
type PrefetchablePath = string;

const moduleLoaders: { [Key in RouteModuleKey]: () => Promise<RouteModuleMap[Key]> } = {
  appShell: () => import("../components/AppShell"),
  staffShell: () => import("../components/StaffShell"),
  auth: () => import("../pages/AuthPage"),
  onboarding: () => import("../pages/OnboardingPage"),
  dashboard: () => import("../pages/DashboardPage"),
  accreditation: () => import("../pages/AccreditationPage"),
  cases: () => import("../pages/CasesPage"),
  osce: () => import("../pages/OscePage"),
  osceStation: () => import("../pages/OsceStationPage"),
  practice: () => import("../pages/PracticePage"),
  settings: () => import("../pages/SettingsPage"),
  notifications: () => import("../pages/NotificationsPage"),
  schedule: () => import("../pages/SchedulePage"),
  analytics: () => import("../pages/AnalyticsPage"),
  testSession: () => import("../pages/TestSessionPage"),
  adminContentCoverage: () => import("../pages/AdminContentCoveragePage"),
  adminStudents: () => import("../pages/AdminStudentsPage"),
  adminCases: () => import("../pages/AdminCasesPage"),
  adminOsce: () => import("../pages/AdminOscePage"),
  adminQuestions: () => import("../pages/AdminQuestionsPage"),
};

const moduleCache = new Map<RouteModuleKey, Promise<unknown>>();

function loadModule<Key extends RouteModuleKey>(key: Key): Promise<RouteModuleMap[Key]> {
  const cached = moduleCache.get(key) as Promise<RouteModuleMap[Key]> | undefined;

  if (cached) {
    return cached;
  }

  const nextPromise = moduleLoaders[key]();
  moduleCache.set(key, nextPromise);
  return nextPromise;
}

function resolveRouteModuleKey(path: PrefetchablePath): RouteModuleKey | null {
  if (path === "/auth") {
    return "auth";
  }

  if (path === "/app/onboarding") {
    return "onboarding";
  }

  if (path === "/app/dashboard") {
    return "dashboard";
  }

  if (path === "/app/accreditation") {
    return "accreditation";
  }

  if (path === "/app/practice") {
    return "practice";
  }

  if (path === "/app/cases") {
    return "cases";
  }

  if (path === "/app/osce") {
    return "osce";
  }

  if (path.startsWith("/app/osce/")) {
    return "osceStation";
  }

  if (path === "/app/schedule") {
    return "schedule";
  }

  if (path === "/app/settings") {
    return "settings";
  }

  if (path === "/app/notifications") {
    return "notifications";
  }

  if (path === "/app/analytics") {
    return "analytics";
  }

  if (path.startsWith("/app/tests/")) {
    return "testSession";
  }

  if (path === "/staff/coverage") {
    return "adminContentCoverage";
  }

  if (path === "/staff/students") {
    return "adminStudents";
  }

  if (path === "/staff/cases") {
    return "adminCases";
  }

  if (path === "/staff/osce") {
    return "adminOsce";
  }

  if (path === "/staff/questions") {
    return "adminQuestions";
  }

  return null;
}

export function preloadRoute(path: PrefetchablePath): void {
  const key = resolveRouteModuleKey(path);

  if (!key) {
    return;
  }

  void loadModule(key);
}

export function getRoutePrefetchProps(path: PrefetchablePath) {
  return {
    onMouseEnter: () => preloadRoute(path),
    onFocus: () => preloadRoute(path),
    onTouchStart: () => preloadRoute(path),
  };
}

export const loadAppShellModule = () => loadModule("appShell");
export const loadStaffShellModule = () => loadModule("staffShell");
export const loadAuthPageModule = () => loadModule("auth");
export const loadOnboardingPageModule = () => loadModule("onboarding");
export const loadDashboardPageModule = () => loadModule("dashboard");
export const loadAccreditationPageModule = () => loadModule("accreditation");
export const loadCasesPageModule = () => loadModule("cases");
export const loadOscePageModule = () => loadModule("osce");
export const loadOsceStationPageModule = () => loadModule("osceStation");
export const loadPracticePageModule = () => loadModule("practice");
export const loadSettingsPageModule = () => loadModule("settings");
export const loadNotificationsPageModule = () => loadModule("notifications");
export const loadSchedulePageModule = () => loadModule("schedule");
export const loadAnalyticsPageModule = () => loadModule("analytics");
export const loadTestSessionPageModule = () => loadModule("testSession");
export const loadAdminContentCoveragePageModule = () => loadModule("adminContentCoverage");
export const loadAdminStudentsPageModule = () => loadModule("adminStudents");
export const loadAdminCasesPageModule = () => loadModule("adminCases");
export const loadAdminOscePageModule = () => loadModule("adminOsce");
export const loadAdminQuestionsPageModule = () => loadModule("adminQuestions");
