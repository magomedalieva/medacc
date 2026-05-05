import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";

import { EmptyState } from "../components/Ui";
import { useAuth } from "../contexts/AuthContext";
import { api, ApiError } from "../lib/api";
import type { AdminStudentListItem, AdminStudentListResponse, Faculty } from "../types/api";

const PAGE_SIZE = 50;

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function hasRecentActivity(item: AdminStudentListItem): boolean {
  const rawDate = item.last_login_at ?? item.last_activity_date;

  if (!rawDate) {
    return false;
  }

  const date = new Date(rawDate.includes("T") ? rawDate : `${rawDate}T00:00:00`);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return !Number.isNaN(date.getTime()) && date.getTime() >= sevenDaysAgo;
}

function progressTone(value: number): "accent" | "green" | "warm" {
  if (value >= 70) {
    return "green";
  }

  if (value >= 40) {
    return "warm";
  }

  return "accent";
}

function shouldShowProtocolStatus(status: string): boolean {
  return status !== "not_started" && status !== "risk";
}

export function AdminStudentsPage() {
  const { token } = useAuth();
  const [data, setData] = useState<AdminStudentListResponse | null>(null);
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [search, setSearch] = useState("");
  const [facultyFilterId, setFacultyFilterId] = useState("");
  const [offset, setOffset] = useState(0);
  const [expandedStudentId, setExpandedStudentId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    setOffset(0);
  }, [deferredSearch, facultyFilterId]);

  useEffect(() => {
    setExpandedStudentId(null);
  }, [deferredSearch, facultyFilterId, offset]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isActive = true;
    setLoading(true);
    setError(null);

    void Promise.all([
      api.listAdminStudents(token, {
        faculty_id: facultyFilterId ? Number(facultyFilterId) : null,
        search: deferredSearch.trim() || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
      api.listFaculties(token),
    ])
      .then(([studentResponse, facultyItems]) => {
        if (!isActive) {
          return;
        }

        setData(studentResponse);
        setFaculties(facultyItems);
      })
      .catch((exception) => {
        if (!isActive) {
          return;
        }

        setError(exception instanceof ApiError ? exception.message : "Не удалось загрузить студентов");
      })
      .finally(() => {
        if (isActive) {
          setLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [deferredSearch, facultyFilterId, offset, token]);

  const students = data?.items ?? [];
  const activeStudents = students.filter(hasRecentActivity).length;
  const onboardedStudents = students.filter((student) => student.onboarding_completed).length;
  const resultLabel = data ? `${data.total} студентов` : "Загрузка студентов";
  const canGoBack = offset > 0;
  const canGoForward = data ? offset + data.items.length < data.total : false;

  const selectedFacultyName = useMemo(() => {
    if (!facultyFilterId) {
      return "Все факультеты";
    }

    return faculties.find((faculty) => faculty.id === Number(facultyFilterId))?.name ?? "Факультет";
  }, [faculties, facultyFilterId]);

  function toggleStudent(studentId: number) {
    setExpandedStudentId((currentId) => (currentId === studentId ? null : studentId));
  }

  function handleStudentKeyDown(event: KeyboardEvent<HTMLElement>, studentId: number) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    toggleStudent(studentId);
  }

  return (
    <div className="page-shell admin-page" data-testid="admin-students-page">
      <section className="masthead">
        <div>
          <div className="page-kicker">Учебное сопровождение</div>
          <h1 className="page-title">
            Студенты <em>и готовность</em>
          </h1>
          <p className="page-subtitle">
            Сводка по зарегистрированным студентам без лишней детализации ошибок: факультет, дата аккредитации,
            общий прогресс пробной аккредитации и последняя активность.
          </p>
        </div>
        <div className="toolbar-row">
          <label className="search-field">
            <span>Поиск студента</span>
            <input onChange={(event) => setSearch(event.target.value)} placeholder="Имя, фамилия или email" value={search} />
          </label>
          <label className="field compact-field">
            <span>Факультет</span>
            <select onChange={(event) => setFacultyFilterId(event.target.value)} value={facultyFilterId}>
              <option value="">Все факультеты</option>
              {faculties.map((faculty) => (
                <option key={faculty.id} value={faculty.id}>
                  {faculty.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? <div className="notice danger show" data-testid="admin-students-error">{error}</div> : null}

      <div className="stats-strip">
        <article className="stat-card c-accent">
          <div className="stat-card-val">{data?.total ?? "..."}</div>
          <div className="stat-card-lbl">{selectedFacultyName}</div>
        </article>
        <article className="stat-card c-gold">
          <div className="stat-card-val">{activeStudents}</div>
          <div className="stat-card-lbl">активны за 7 дней</div>
        </article>
        <article className="stat-card c-blue">
          <div className="stat-card-val">{onboardedStudents}</div>
          <div className="stat-card-lbl">онбординг завершили</div>
        </article>
      </div>

      <section className="students-panel">
        <div className="students-panel-head">
          <div>
            <div className="sec-lbl">Список студентов</div>
            <div className="admin-question-count">
              {resultLabel} · онбординг завершили {onboardedStudents} из {students.length}
            </div>
          </div>
          <div className="students-pager">
            <button className="btn btn-o btn-xs" disabled={!canGoBack || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} type="button">
              Назад
            </button>
            <button className="btn btn-o btn-xs" disabled={!canGoForward || loading} onClick={() => setOffset(offset + PAGE_SIZE)} type="button">
              Далее
            </button>
          </div>
        </div>

        {loading ? (
          <div className="admin-list">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        ) : students.length > 0 ? (
          <div className="student-list">
            {students.map((student, index) => {
              const fullName = `${student.first_name} ${student.last_name}`.trim();
              const isExpanded = expandedStudentId === student.id;
              const progressItems = [
                { label: "Тесты", value: student.progress.tests_percent },
                { label: "Кейсы", value: student.progress.cases_percent },
                { label: "ОСКЭ", value: student.progress.osce_percent },
              ];

              return (
                <article
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Скрыть" : "Показать"} прогресс: ${fullName || student.email}`}
                  className={`student-card ${isExpanded ? "student-card-open" : ""}`}
                  key={student.id}
                  onClick={() => toggleStudent(student.id)}
                  onKeyDown={(event) => handleStudentKeyDown(event, student.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="student-card-head">
                    <div className="student-title-row">
                      <span className="student-number">{offset + index + 1}</span>
                      <div className="student-title-block">
                        <strong>{fullName || student.email}</strong>
                        <span>{student.email}</span>
                      </div>
                    </div>
                    <span className="student-card-chevron" aria-hidden="true" />
                  </div>

                  <div className="student-facts">
                    <span>
                      <b>Факультет</b>
                      {student.faculty_name ?? "Не выбран"}
                    </span>
                    <span>
                      <b>Аккредитация</b>
                      {formatDate(student.accreditation_date)}
                    </span>
                    <span>
                      <b>Последний вход</b>
                      {formatDateTime(student.last_login_at)}
                    </span>
                    <span>
                      <b>Активность</b>
                      {formatDate(student.last_activity_date)}
                    </span>
                  </div>

                  {isExpanded ? (
                    <div className="student-progress-panel">
                      <div className="student-progress-summary">
                        <span>Готовность</span>
                        <strong>{student.progress.overall_percent}%</strong>
                        {shouldShowProtocolStatus(student.progress.protocol_status) ? (
                          <em>{student.progress.protocol_label}</em>
                        ) : null}
                      </div>
                      <div className={`student-progress-track tone-${progressTone(student.progress.overall_percent)}`}>
                        <i style={{ width: `${student.progress.overall_percent}%` }} />
                      </div>
                      <div className="student-stage-grid">
                        {progressItems.map((item) => (
                          <span className="student-stage-item" key={item.label}>
                            <b>{item.label}</b>
                            <strong>{item.value}%</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            description="Попробуй изменить поиск или фильтр факультета."
            title="Студенты не найдены"
          />
        )}
      </section>
    </div>
  );
}
