import { useEffect, useMemo, useState } from "react";

import { EmptyState, StatusPill } from "../components/Ui";
import { useAuth } from "../contexts/AuthContext";
import { api, ApiError } from "../lib/api";
import type { AdminContentCoverage, AdminContentCoverageFaculty, AdminContentCoverageTopic } from "../types/api";

function percent(value: number, target: number): number {
  if (target <= 0) {
    return 100;
  }

  return Math.min(Math.round((value / target) * 100), 100);
}

const FULL_CONTENT_TARGETS = {
  questions: 800,
  cases: 120,
  osce: 64,
} as const;

function isFullContentLayerReady(faculty: AdminContentCoverageFaculty): boolean {
  return (
    faculty.active_question_count >= FULL_CONTENT_TARGETS.questions &&
    faculty.case_count >= FULL_CONTENT_TARGETS.cases &&
    faculty.osce_station_count >= FULL_CONTENT_TARGETS.osce
  );
}

function gapLabel(gap: string): string {
  if (gap === "tests") {
    return "тесты";
  }

  if (gap === "cases") {
    return "кейсы";
  }

  if (gap === "osce") {
    return "ОСКЭ";
  }

  return gap;
}

function flattenTopics(faculty: AdminContentCoverageFaculty | null): AdminContentCoverageTopic[] {
  if (!faculty) {
    return [];
  }

  return faculty.sections.flatMap((section) => section.topics);
}

export function AdminContentCoveragePage() {
  const { token } = useAuth();
  const [coverage, setCoverage] = useState<AdminContentCoverage | null>(null);
  const [selectedFacultyCode, setSelectedFacultyCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    void api
      .getAdminContentCoverage(token)
      .then((response) => {
        setCoverage(response);
        setSelectedFacultyCode((currentCode) => {
          if (response.faculties.some((faculty) => faculty.faculty_code === currentCode)) {
            return currentCode;
          }

          return response.faculties[0]?.faculty_code ?? "";
        });
      })
      .catch((exception) => {
        setError(exception instanceof ApiError ? exception.message : "Не удалось загрузить покрытие контента");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  const selectedFaculty = useMemo(
    () => coverage?.faculties.find((faculty) => faculty.faculty_code === selectedFacultyCode) ?? coverage?.faculties[0] ?? null,
    [coverage, selectedFacultyCode],
  );
  const topics = useMemo(() => flattenTopics(selectedFaculty), [selectedFaculty]);
  const nonEmptyTopics = topics.filter(
    (topic) =>
      topic.active_question_count > 0 ||
      topic.inactive_question_count > 0 ||
      topic.case_count > 0 ||
      topic.osce_station_count > 0,
  );

  return (
    <div className="page-shell admin-page" data-testid="admin-content-coverage-page">
      <section className="masthead">
        <div>
          <div className="page-kicker">Управление контентом</div>
          <h1 className="page-title">
            Покрытие <em>контента</em>
          </h1>
          <p className="page-subtitle">
            Карта наполнения по факультетам, разделам и темам. Она помогает видеть, где уже хватает материала для
            пробной аккредитации, а где следующая партия даст самый большой эффект.
          </p>
        </div>
        {coverage ? (
          <div className="toolbar-row">
            <label className="field compact-field">
              <span>Факультет</span>
              <select onChange={(event) => setSelectedFacultyCode(event.target.value)} value={selectedFaculty?.faculty_code ?? ""}>
                {coverage.faculties.map((faculty) => (
                  <option key={faculty.faculty_code} value={faculty.faculty_code}>
                    {faculty.faculty_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </section>

      {error ? <div className="notice danger show">{error}</div> : null}

      {loading ? (
        <div className="stack-section">
          <div className="skeleton-card tall" />
          <div className="skeleton-card tall" />
        </div>
      ) : coverage && selectedFaculty ? (
        <>
          <div className="stats-strip">
            <article className="stat-card c-accent">
              <div className="stat-card-val">{coverage.totals.active_question_count}</div>
              <div className="stat-card-lbl">активных вопросов</div>
            </article>
            <article className="stat-card c-green">
              <div className="stat-card-val">{coverage.totals.case_count}</div>
              <div className="stat-card-lbl">кейсов</div>
            </article>
            <article className="stat-card c-blue">
              <div className="stat-card-val">{coverage.totals.osce_station_count}</div>
              <div className="stat-card-lbl">ОСКЭ-станций</div>
            </article>
            <article className="stat-card c-gold">
              <div className="stat-card-val">{coverage.faculties.filter(isFullContentLayerReady).length}</div>
              <div className="stat-card-lbl">полных факультетов</div>
            </article>
          </div>

          <section className="coverage-faculty-grid">
            {coverage.faculties.map((faculty) => {
              const fullLayerReady = isFullContentLayerReady(faculty);

              return (
                <button
                  className={`coverage-faculty-card${faculty.faculty_code === selectedFaculty.faculty_code ? " selected" : ""}`}
                  key={faculty.faculty_code}
                  onClick={() => setSelectedFacultyCode(faculty.faculty_code)}
                  type="button"
                >
                  <div className="coverage-faculty-head">
                    <div>
                      <div className="coverage-faculty-code">{faculty.faculty_code}</div>
                      <strong>{faculty.faculty_name}</strong>
                    </div>
                    <StatusPill
                      label={fullLayerReady ? "Полный слой" : faculty.strict_simulation_ready ? "Минимум готов" : "Нужно добрать"}
                      size="compact"
                      tone={fullLayerReady || faculty.strict_simulation_ready ? "green" : "warm"}
                    />
                  </div>
                  <div className="coverage-bars">
                    <div>
                      <span>Тесты</span>
                      <strong>
                        {faculty.active_question_count} / {FULL_CONTENT_TARGETS.questions}
                      </strong>
                      <div className="coverage-progress">
                        <i style={{ width: `${percent(faculty.active_question_count, FULL_CONTENT_TARGETS.questions)}%` }} />
                      </div>
                    </div>
                    <div>
                      <span>Кейсы</span>
                      <strong>
                        {faculty.case_count} / {FULL_CONTENT_TARGETS.cases}
                      </strong>
                      <div className="coverage-progress">
                        <i style={{ width: `${percent(faculty.case_count, FULL_CONTENT_TARGETS.cases)}%` }} />
                      </div>
                    </div>
                    <div>
                      <span>ОСКЭ</span>
                      <strong>
                        {faculty.osce_station_count} / {FULL_CONTENT_TARGETS.osce}
                      </strong>
                      <div className="coverage-progress">
                        <i style={{ width: `${percent(faculty.osce_station_count, FULL_CONTENT_TARGETS.osce)}%` }} />
                      </div>
                    </div>
                  </div>
                  {fullLayerReady ? (
                    <div className="coverage-gap-row full">полный слой закрыт</div>
                  ) : faculty.gaps.length > 0 ? (
                    <div className="coverage-gap-row">{faculty.gaps.map(gapLabel).join(", ")}</div>
                  ) : (
                    <div className="coverage-gap-row ready">технический минимум закрыт</div>
                  )}
                </button>
              );
            })}
          </section>

          <section className="coverage-detail">
            <div className="coverage-detail-head">
              <div>
                <div className="sec-lbl">Детализация</div>
                <h2>{selectedFaculty.faculty_name}</h2>
              </div>
              <div className="coverage-summary">
                <span>{selectedFaculty.active_question_count} активных вопросов</span>
                <span>{selectedFaculty.case_quiz_question_count} вопросов в кейсах</span>
                <span>{selectedFaculty.osce_checklist_item_count} пунктов ОСКЭ</span>
              </div>
            </div>

            {nonEmptyTopics.length > 0 ? (
              <div className="coverage-table-wrap">
                <table className="coverage-table">
                  <thead>
                    <tr>
                      <th>Раздел</th>
                      <th>Тема</th>
                      <th>Тесты</th>
                      <th>Скрытые</th>
                      <th>Кейсы</th>
                      <th>Quiz кейсов</th>
                      <th>ОСКЭ</th>
                      <th>Чек-лист</th>
                      <th>Quiz ОСКЭ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nonEmptyTopics.map((topic) => (
                      <tr key={topic.topic_id}>
                        <td>{topic.section_name}</td>
                        <td>{topic.topic_name}</td>
                        <td>{topic.active_question_count}</td>
                        <td>{topic.inactive_question_count}</td>
                        <td>{topic.case_count}</td>
                        <td>{topic.case_quiz_question_count}</td>
                        <td>{topic.osce_station_count}</td>
                        <td>{topic.osce_checklist_item_count}</td>
                        <td>{topic.osce_quiz_question_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                description="Для выбранного факультета пока нет вопросов, кейсов или ОСКЭ-станций."
                title="Покрытие еще пустое"
              />
            )}
          </section>
        </>
      ) : (
        <EmptyState description="Сначала должны быть заведены факультеты и темы." title="Нет данных для покрытия" />
      )}
    </div>
  );
}
