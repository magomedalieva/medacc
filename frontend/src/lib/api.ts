import type {
  AdminClinicalCaseDetails,
  AdminClinicalCaseListItem,
  AdminClinicalCaseWriteInput,
  AdminContentCoverage,
  AdminOsceStationDetails,
  AdminOsceStationListItem,
  AdminOsceStationWriteInput,
  AdminQuestionDeleteResult,
  AdminQuestionDetails,
  AdminQuestionListResponse,
  AdminQuestionWriteInput,
  AdminStudentListResponse,
  AnalyticsOverview,
  AuthResponse,
  ClinicalCaseAttemptAnalytics,
  ClinicalCaseAttemptReviewAnalytics,
  ClinicalCaseAttemptStartResponse,
  ClinicalCaseDetail,
  ClinicalCaseCompletionResponse,
  ClinicalCaseListItem,
  DailyAnalytics,
  ExamReadinessProtocol,
  ExamSimulation,
  Faculty,
  ImportFileItem,
  OsceAttemptStartResponse,
  OsceAttemptSubmitResponse,
  OsceStationReviewAnalytics,
  PasswordChangeResult,
  OsceStationDetail,
  OsceStationListItem,
  PlanTask,
  QuestionImportResult,
  QuestionImportValidationResult,
  ReadinessSummary,
  RepeatingQuestionErrorAnalytics,
  ScheduleResponse,
  ScheduleTodayResponse,
  TestSession,
  TestSessionAnswerResponse,
  TestSessionFinishResponse,
  Topic,
  TopicAnalytics,
  TopicQuestionErrorAnalytics,
  User,
} from "../types/api";
import { SESSION_TOKEN_MARKER } from "./authSession";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");
const REQUEST_CACHE_SEPARATOR = "\u0001";
const SHORT_GET_CACHE_TTL_MS = 20_000;
const CONTENT_GET_CACHE_TTL_MS = 60_000;
const STATIC_GET_CACHE_TTL_MS = 5 * 60_000;

interface CachedResponse {
  expiresAt: number;
  value: unknown;
}

const responseCache = new Map<string, CachedResponse>();
const inFlightGetRequests = new Map<string, Promise<unknown>>();
const cacheGenerationByKey = new Map<string, number>();

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  cacheTtlMs?: number;
  token?: string | null;
};

interface ValidationErrorDetail {
  msg?: string;
  loc?: Array<string | number>;
}

function formatValidationMessage(item: ValidationErrorDetail): string {
  const rawMessage = item.msg?.trim();

  if (!rawMessage) {
    return "Ошибка запроса";
  }

  if (rawMessage.startsWith("Value error, ")) {
    return rawMessage.replace("Value error, ", "");
  }

  if (rawMessage === "Field required") {
    return "Обязательное поле не заполнено";
  }

  if (rawMessage.includes("Input should be a valid integer")) {
    return "Введите корректное целое число";
  }

  if (rawMessage.includes("Input should be a valid number")) {
    return "Введите корректное число";
  }

  if (rawMessage.includes("Input should be a valid string")) {
    return "Введите текстовое значение";
  }

  if (rawMessage.includes("Input should be a valid boolean")) {
    return "Значение должно быть да или нет";
  }

  if (rawMessage.includes("Input should be greater than")) {
    return "Значение должно быть больше минимально допустимого";
  }

  if (rawMessage.includes("Input should be less than")) {
    return "Значение должно быть меньше максимально допустимого";
  }

  if (/^[\x00-\x7F]+$/.test(rawMessage)) {
    return "Проверь данные формы";
  }

  return rawMessage;
}

function normalizeErrorMessage(message: string | null | undefined, status: number): string {
  const trimmed = message?.trim();

  if (!trimmed) {
    return status >= 500 ? "На сервере произошла внутренняя ошибка. Попробуйте еще раз." : "Не удалось выполнить запрос";
  }

  if (/^internal server error$/i.test(trimmed)) {
    return "На сервере произошла внутренняя ошибка. Попробуйте еще раз.";
  }

  return trimmed;
}

function buildCacheKey(method: string, path: string, token: string | null | undefined): string {
  const tokenKey = token && token !== SESSION_TOKEN_MARKER ? token : "cookie-session";
  return [method.toUpperCase(), tokenKey, path].join(REQUEST_CACHE_SEPARATOR);
}

function getPathFromCacheKey(key: string): string {
  return key.split(REQUEST_CACHE_SEPARATOR, 3)[2] ?? "";
}

function createAbortError(): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }

  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function bumpCacheGeneration(key: string) {
  cacheGenerationByKey.set(key, (cacheGenerationByKey.get(key) ?? 0) + 1);
}

function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }

  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }

  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(createAbortError());
    };

    signal.addEventListener("abort", abort, { once: true });

    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);

        if (signal.aborted) {
          reject(createAbortError());
          return;
        }

        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function invalidateApiCache(pathPrefixes: string[]) {
  if (pathPrefixes.length === 0) {
    return;
  }

  const invalidatedKeys = new Set<string>();

  for (const [key] of responseCache) {
    const path = getPathFromCacheKey(key);

    if (pathPrefixes.some((prefix) => path.startsWith(prefix))) {
      responseCache.delete(key);
      invalidatedKeys.add(key);
    }
  }

  for (const [key] of inFlightGetRequests) {
    const path = getPathFromCacheKey(key);

    if (pathPrefixes.some((prefix) => path.startsWith(prefix))) {
      inFlightGetRequests.delete(key);
      invalidatedKeys.add(key);
    }
  }

  invalidatedKeys.forEach((key) => {
    bumpCacheGeneration(key);
  });
}

function clearApiCache() {
  const invalidatedKeys = new Set([...responseCache.keys(), ...inFlightGetRequests.keys()]);
  invalidatedKeys.forEach((key) => {
    bumpCacheGeneration(key);
  });
  responseCache.clear();
  inFlightGetRequests.clear();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, cacheTtlMs = 0, token, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);
  headers.set("Accept", "application/json");
  const method = (fetchOptions.method ?? "GET").toUpperCase();
  const signal = fetchOptions.signal ?? undefined;
  const cacheKey = cacheTtlMs > 0 && method === "GET" ? buildCacheKey(method, path, token) : null;
  const requestGeneration = cacheKey ? cacheGenerationByKey.get(cacheKey) ?? 0 : 0;
  const cachedResponse = cacheKey ? responseCache.get(cacheKey) : null;

  if (cachedResponse && cachedResponse.expiresAt > Date.now()) {
    return cachedResponse.value as T;
  }

  if (cachedResponse) {
    responseCache.delete(cacheKey!);
  }

  const init: RequestInit = {
    ...fetchOptions,
    method,
    credentials: fetchOptions.credentials ?? "include",
    headers,
  };

  if (token && token !== SESSION_TOKEN_MARKER) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(body);
  }

  if (cacheKey) {
    const inFlightRequest = inFlightGetRequests.get(cacheKey);

    if (inFlightRequest) {
      return raceWithAbort(inFlightRequest as Promise<T>, signal);
    }
  }

  const executeRequest = (async () => {
    const response = await fetch(`${apiBaseUrl}${path}`, cacheKey ? { ...init, signal: undefined } : init);
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      const message =
        typeof payload === "string"
          ? normalizeErrorMessage(payload, response.status)
          : Array.isArray(payload?.detail)
            ? payload.detail.map(formatValidationMessage).join(". ")
            : normalizeErrorMessage(payload?.detail, response.status);

      throw new ApiError(message, response.status, payload?.code);
    }

    if (cacheKey && (cacheGenerationByKey.get(cacheKey) ?? 0) === requestGeneration) {
      responseCache.set(cacheKey, {
        expiresAt: Date.now() + cacheTtlMs,
        value: payload,
      });
    }

    return payload as T;
  })();

  if (cacheKey) {
    inFlightGetRequests.set(cacheKey, executeRequest);
    void executeRequest.finally(() => {
      if (inFlightGetRequests.get(cacheKey) === executeRequest) {
        inFlightGetRequests.delete(cacheKey);
      }
    });
  }

  return raceWithAbort(executeRequest, signal);
}

export const api = {
  async register(payload: { first_name: string; last_name: string; email: string; password: string }) {
    const response = await request<AuthResponse>("/auth/register", { method: "POST", body: payload });
    clearApiCache();
    return response;
  },
  async login(payload: { email: string; password: string }) {
    const response = await request<AuthResponse>("/auth/login", { method: "POST", body: payload });
    clearApiCache();
    return response;
  },
  async logout() {
    const response = await request<{ logged_out: boolean }>("/auth/logout", { method: "POST" });
    clearApiCache();
    return response;
  },
  getMe(token: string, signal?: AbortSignal) {
    return request<User>("/auth/me", { token, signal, cacheTtlMs: SHORT_GET_CACHE_TTL_MS });
  },
  async updateProfile(token: string, payload: { first_name: string; last_name: string; email: string }) {
    const response = await request<User>("/auth/profile", { method: "PATCH", token, body: payload });
    invalidateApiCache(["/auth/me"]);
    return response;
  },
  changePassword(token: string, payload: { current_password: string; new_password: string }) {
    return request<PasswordChangeResult>("/auth/change-password", { method: "POST", token, body: payload });
  },
  listFaculties(token: string) {
    return request<Faculty[]>("/faculties", { token, cacheTtlMs: STATIC_GET_CACHE_TTL_MS });
  },
  async completeOnboarding(
    token: string,
    payload: {
      faculty_id: number;
      accreditation_date: string;
      daily_study_minutes: number;
      study_intensity: "gentle" | "steady" | "intensive";
      study_weekdays: number[];
    },
  ) {
    const response = await request<{ user: User }>("/onboarding/complete", { method: "POST", token, body: payload });
    clearApiCache();
    return response;
  },
  getSchedule(token: string, signal?: AbortSignal) {
    return request<ScheduleResponse>("/schedule", { token, signal, cacheTtlMs: SHORT_GET_CACHE_TTL_MS });
  },
  getTodaySchedule(token: string, signal?: AbortSignal) {
    return request<ScheduleTodayResponse>("/schedule/today", { token, signal, cacheTtlMs: SHORT_GET_CACHE_TTL_MS });
  },
  async updateSchedulePreferences(
    token: string,
    payload: {
      daily_study_minutes: number;
      study_intensity: "gentle" | "steady" | "intensive";
      study_weekdays: number[];
    },
  ) {
    const response = await request<{ user: User; schedule: ScheduleResponse }>("/schedule/preferences", {
      method: "PATCH",
      token,
      body: payload,
    });
    invalidateApiCache(["/schedule", "/analytics"]);
    return response;
  },
  async regenerateSchedule(token: string) {
    const response = await request<ScheduleResponse>("/schedule/regenerate", { method: "POST", token });
    invalidateApiCache(["/schedule", "/analytics"]);
    return response;
  },
  async skipTask(token: string, taskId: number) {
    const response = await request<PlanTask>(`/schedule/tasks/${taskId}/skip`, { method: "POST", token });
    invalidateApiCache(["/schedule", "/analytics"]);
    return response;
  },
  async postponeTask(token: string, taskId: number) {
    const response = await request<PlanTask>(`/schedule/tasks/${taskId}/postpone`, { method: "POST", token });
    invalidateApiCache(["/schedule", "/analytics"]);
    return response;
  },
  async rescheduleTask(token: string, taskId: number, payload: { target_date: string }) {
    const response = await request<ScheduleResponse>(`/schedule/tasks/${taskId}/reschedule`, {
      method: "POST",
      token,
      body: payload,
    });
    invalidateApiCache(["/schedule", "/analytics"]);
    return response;
  },
  getAnalyticsOverview(token: string, signal?: AbortSignal) {
    return request<AnalyticsOverview>("/analytics/overview", { token, signal, cacheTtlMs: SHORT_GET_CACHE_TTL_MS });
  },
  getAnalyticsReadiness(token: string, signal?: AbortSignal) {
    return request<ReadinessSummary>("/analytics/readiness", { token, signal, cacheTtlMs: SHORT_GET_CACHE_TTL_MS });
  },
  getLearningReadiness(token: string, signal?: AbortSignal) {
    return request<ReadinessSummary>("/analytics/learning/readiness", {
      token,
      signal,
      cacheTtlMs: SHORT_GET_CACHE_TTL_MS,
    });
  },
  getExamProtocol(token: string, signal?: AbortSignal) {
    return request<ExamReadinessProtocol>("/accreditation/protocol", {
      token,
      signal,
      cacheTtlMs: SHORT_GET_CACHE_TTL_MS,
    });
  },
  listExamSimulations(token: string, signal?: AbortSignal) {
    return request<ExamSimulation[]>("/accreditation/simulations", {
      token,
      signal,
      cacheTtlMs: SHORT_GET_CACHE_TTL_MS,
    });
  },
  async createExamSimulation(token: string, payload: { simulation_type?: string } = {}) {
    const response = await request<ExamSimulation>("/accreditation/simulations", {
      method: "POST",
      token,
      body: payload,
    });
    invalidateApiCache(["/accreditation", "/analytics"]);
    return response;
  },
  getAnalyticsTopics(token: string, signal?: AbortSignal) {
    return request<TopicAnalytics[]>("/analytics/topics", { token, signal, cacheTtlMs: SHORT_GET_CACHE_TTL_MS });
  },
  getAnalyticsHistory(token: string, signal?: AbortSignal) {
    return request<DailyAnalytics[]>("/analytics/history", { token, signal, cacheTtlMs: SHORT_GET_CACHE_TTL_MS });
  },
  getAnalyticsCases(token: string, signal?: AbortSignal) {
    return request<ClinicalCaseAttemptAnalytics[]>("/analytics/cases", { token, signal, cacheTtlMs: SHORT_GET_CACHE_TTL_MS });
  },
  getAnalyticsCaseReview(token: string, attemptId: string, signal?: AbortSignal) {
    return request<ClinicalCaseAttemptReviewAnalytics>(`/analytics/cases/${attemptId}/review`, {
      token,
      signal,
      cacheTtlMs: SHORT_GET_CACHE_TTL_MS,
    });
  },
  getAnalyticsRepeatingErrors(token: string, signal?: AbortSignal) {
    return request<RepeatingQuestionErrorAnalytics[]>("/analytics/repeating-errors", {
      token,
      signal,
      cacheTtlMs: SHORT_GET_CACHE_TTL_MS,
    });
  },
  getAnalyticsTopicErrors(token: string, topicId: number, signal?: AbortSignal) {
    return request<TopicQuestionErrorAnalytics[]>(`/analytics/topics/${topicId}/errors`, {
      token,
      signal,
      cacheTtlMs: SHORT_GET_CACHE_TTL_MS,
    });
  },
  getAnalyticsOsceReview(token: string, stationSlug: string, signal?: AbortSignal) {
    return request<OsceStationReviewAnalytics>(`/analytics/osce/${stationSlug}/review`, {
      token,
      signal,
      cacheTtlMs: SHORT_GET_CACHE_TTL_MS,
    });
  },
  listTopics(token: string, facultyId?: number) {
    const query = facultyId ? `?faculty_id=${facultyId}` : "";
    return request<Topic[]>(`/topics${query}`, { token, cacheTtlMs: STATIC_GET_CACHE_TTL_MS });
  },
  listCases(token: string, signal?: AbortSignal) {
    return request<ClinicalCaseListItem[]>("/cases", { token, signal, cacheTtlMs: CONTENT_GET_CACHE_TTL_MS });
  },
  getCase(token: string, slug: string, signal?: AbortSignal) {
    return request<ClinicalCaseDetail>(`/cases/${slug}`, { token, signal, cacheTtlMs: CONTENT_GET_CACHE_TTL_MS });
  },
  startCaseAttempt(
    token: string,
    slug: string,
    payload: {
      topic_id?: number | null;
      planned_task_id?: number | null;
      simulation_id?: string | null;
      mode: "study" | "exam";
    },
  ) {
    return request<ClinicalCaseAttemptStartResponse>(`/cases/${slug}/attempts`, {
      method: "POST",
      token,
      body: payload,
    });
  },
  async completeCase(
    token: string,
    payload: {
      attempt_id: string;
      slug: string;
      topic_id?: number | null;
      study_minutes: number;
      planned_task_id?: number | null;
      simulation_id?: string | null;
      answers: Array<{ question_id: string; selected_option_label: string }>;
    },
  ) {
    const response = await request<ClinicalCaseCompletionResponse>("/cases/completions", {
      method: "POST",
      token,
      body: payload,
    });
    invalidateApiCache(["/cases", "/schedule", "/analytics", "/accreditation"]);
    return response;
  },
  listOsceStations(token: string, signal?: AbortSignal) {
    return request<OsceStationListItem[]>("/osce/stations", { token, signal, cacheTtlMs: CONTENT_GET_CACHE_TTL_MS });
  },
  getOsceStation(token: string, slug: string, signal?: AbortSignal) {
    return request<OsceStationDetail>(`/osce/stations/${slug}`, {
      token,
      signal,
      cacheTtlMs: CONTENT_GET_CACHE_TTL_MS,
    });
  },
  startOsceAttempt(token: string, slug: string, payload: { planned_task_id?: number | null; simulation_id?: string | null }) {
    return request<OsceAttemptStartResponse>(`/osce/stations/${slug}/attempts/start`, {
      method: "POST",
      token,
      body: payload,
    });
  },
  async submitOsceAttempt(
    token: string,
    slug: string,
    payload: {
      attempt_id: string;
      checklist_item_ids: string[];
      quiz_answers: Array<{ question_id: string; selected_option_label: string }>;
      planned_task_id?: number | null;
    },
  ) {
    const response = await request<OsceAttemptSubmitResponse>(`/osce/stations/${slug}/attempts`, {
      method: "POST",
      token,
      body: payload,
    });
    invalidateApiCache(["/osce/stations", "/schedule", "/analytics", "/accreditation"]);
    return response;
  },
  startSession(
    token: string,
    payload: {
      topic_id?: number | null;
      question_count: number;
      mode: "learning" | "exam";
      planned_task_id?: number | null;
      simulation_id?: string | null;
      question_ids?: number[] | null;
    },
  ) {
    return request<TestSession>("/tests/sessions", { method: "POST", token, body: payload });
  },
  getSession(token: string, sessionId: string) {
    return request<TestSession>(`/tests/sessions/${sessionId}`, { token });
  },
  submitAnswer(token: string, sessionId: string, payload: { question_id: number; selected_option_label: string }) {
    return request<TestSessionAnswerResponse>(`/tests/sessions/${sessionId}/answers`, {
      method: "POST",
      token,
      body: payload,
    });
  },
  async finishSession(token: string, sessionId: string, payload?: { planned_task_id?: number | null }) {
    const response = await request<TestSessionFinishResponse>(`/tests/sessions/${sessionId}/finish`, {
      method: "POST",
      token,
      body: payload,
    });
    invalidateApiCache(["/schedule", "/analytics", "/accreditation"]);
    return response;
  },
  listAdminQuestions(
    token: string,
    params: {
      faculty_id?: number | null;
      topic_id?: number | null;
      search?: string;
      is_active?: boolean | null;
      limit?: number;
      offset?: number;
    },
  ) {
    const searchParams = new URLSearchParams();

    if (params.faculty_id) {
      searchParams.set("faculty_id", String(params.faculty_id));
    }

    if (params.topic_id) {
      searchParams.set("topic_id", String(params.topic_id));
    }

    if (params.search) {
      searchParams.set("search", params.search);
    }

    if (params.is_active !== null && params.is_active !== undefined) {
      searchParams.set("is_active", String(params.is_active));
    }

    searchParams.set("limit", String(params.limit ?? 50));
    searchParams.set("offset", String(params.offset ?? 0));

    return request<AdminQuestionListResponse>(`/admin/questions?${searchParams.toString()}`, { token });
  },
  getAdminContentCoverage(token: string) {
    return request<AdminContentCoverage>("/admin/content/coverage", { token, cacheTtlMs: SHORT_GET_CACHE_TTL_MS });
  },
  listAdminStudents(
    token: string,
    params: {
      faculty_id?: number | null;
      search?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const searchParams = new URLSearchParams();

    if (params.faculty_id) {
      searchParams.set("faculty_id", String(params.faculty_id));
    }

    if (params.search) {
      searchParams.set("search", params.search);
    }

    searchParams.set("limit", String(params.limit ?? 50));
    searchParams.set("offset", String(params.offset ?? 0));

    return request<AdminStudentListResponse>(`/admin/users/students?${searchParams.toString()}`, {
      token,
      cacheTtlMs: SHORT_GET_CACHE_TTL_MS,
    });
  },
  listAdminCases(token: string) {
    return request<AdminClinicalCaseListItem[]>("/admin/cases", { token, cacheTtlMs: SHORT_GET_CACHE_TTL_MS });
  },
  getAdminCase(token: string, slug: string) {
    return request<AdminClinicalCaseDetails>(`/admin/cases/${slug}`, { token, cacheTtlMs: CONTENT_GET_CACHE_TTL_MS });
  },
  async createAdminCase(token: string, payload: AdminClinicalCaseWriteInput) {
    const response = await request<AdminClinicalCaseDetails>("/admin/cases", { method: "POST", token, body: payload });
    invalidateApiCache(["/admin/cases", "/cases"]);
    return response;
  },
  async updateAdminCase(token: string, slug: string, payload: AdminClinicalCaseWriteInput) {
    const response = await request<AdminClinicalCaseDetails>(`/admin/cases/${slug}`, {
      method: "PUT",
      token,
      body: payload,
    });
    invalidateApiCache(["/admin/cases", "/cases"]);
    return response;
  },
  async deleteAdminCase(token: string, slug: string) {
    const response = await request<{ slug: string; deleted: boolean }>(`/admin/cases/${slug}`, {
      method: "DELETE",
      token,
    });
    invalidateApiCache(["/admin/cases", "/cases"]);
    return response;
  },
  listAdminOsceStations(token: string) {
    return request<AdminOsceStationListItem[]>("/admin/osce", { token, cacheTtlMs: SHORT_GET_CACHE_TTL_MS });
  },
  getAdminOsceStation(token: string, slug: string) {
    return request<AdminOsceStationDetails>(`/admin/osce/${slug}`, { token, cacheTtlMs: CONTENT_GET_CACHE_TTL_MS });
  },
  async createAdminOsceStation(token: string, payload: AdminOsceStationWriteInput) {
    const response = await request<AdminOsceStationDetails>("/admin/osce", { method: "POST", token, body: payload });
    invalidateApiCache(["/admin/osce", "/osce/stations"]);
    return response;
  },
  async updateAdminOsceStation(token: string, slug: string, payload: AdminOsceStationWriteInput) {
    const response = await request<AdminOsceStationDetails>(`/admin/osce/${slug}`, {
      method: "PUT",
      token,
      body: payload,
    });
    invalidateApiCache(["/admin/osce", "/osce/stations"]);
    return response;
  },
  async deleteAdminOsceStation(token: string, slug: string) {
    const response = await request<{ slug: string; deleted: boolean }>(`/admin/osce/${slug}`, {
      method: "DELETE",
      token,
    });
    invalidateApiCache(["/admin/osce", "/osce/stations"]);
    return response;
  },
  getAdminQuestion(token: string, questionId: number) {
    return request<AdminQuestionDetails>(`/admin/questions/${questionId}`, { token, cacheTtlMs: CONTENT_GET_CACHE_TTL_MS });
  },
  async createAdminQuestion(token: string, payload: AdminQuestionWriteInput) {
    const response = await request<AdminQuestionDetails>("/admin/questions", { method: "POST", token, body: payload });
    invalidateApiCache(["/admin/questions", "/topics", "/analytics", "/schedule"]);
    return response;
  },
  async updateAdminQuestion(token: string, questionId: number, payload: AdminQuestionWriteInput) {
    const response = await request<AdminQuestionDetails>(`/admin/questions/${questionId}`, {
      method: "PUT",
      token,
      body: payload,
    });
    invalidateApiCache(["/admin/questions", "/topics", "/analytics", "/schedule"]);
    return response;
  },
  async deactivateAdminQuestion(token: string, questionId: number) {
    const response = await request<AdminQuestionDetails>(`/admin/questions/${questionId}/deactivate`, {
      method: "POST",
      token,
    });
    invalidateApiCache(["/admin/questions", "/topics", "/analytics", "/schedule"]);
    return response;
  },
  async activateAdminQuestion(token: string, questionId: number) {
    const response = await request<AdminQuestionDetails>(`/admin/questions/${questionId}/activate`, {
      method: "POST",
      token,
    });
    invalidateApiCache(["/admin/questions", "/topics", "/analytics", "/schedule"]);
    return response;
  },
  async deleteAdminQuestion(token: string, questionId: number) {
    const response = await request<AdminQuestionDeleteResult>(`/admin/questions/${questionId}`, {
      method: "DELETE",
      token,
    });
    invalidateApiCache(["/admin/questions", "/topics", "/analytics", "/schedule"]);
    return response;
  },
  listImportFiles(token: string) {
    return request<ImportFileItem[]>("/admin/imports/files", { token, cacheTtlMs: SHORT_GET_CACHE_TTL_MS });
  },
  async importQuestions(token: string, payload: { file_name: string }) {
    const response = await request<QuestionImportResult>("/admin/imports/questions", {
      method: "POST",
      token,
      body: payload,
    });
    invalidateApiCache(["/admin/imports", "/admin/questions", "/topics", "/analytics", "/schedule"]);
    return response;
  },
  validateQuestionImport(token: string, payload: { file_name: string }) {
    return request<QuestionImportValidationResult>("/admin/imports/questions/validate", {
      method: "POST",
      token,
      body: payload,
    });
  },
};
