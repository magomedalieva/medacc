export interface User {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  faculty_id: number | null;
  accreditation_date: string | null;
  daily_study_minutes: number;
  study_intensity: "gentle" | "steady" | "intensive";
  study_weekdays: number[];
  onboarding_completed: boolean;
  server_today: string;
}

export interface AuthResponse {
  session_type: string;
  user: User;
}

export interface PasswordChangeResult {
  changed: boolean;
}

export interface Faculty {
  id: number;
  name: string;
  code: string;
  description: string | null;
}

export interface Topic {
  id: number;
  name: string;
  description: string | null;
  section_id: number;
  section_name: string;
}

export interface ClinicalCaseFact {
  label: string;
  value: string;
  tone: string | null;
}

export interface ClinicalCaseQuizOption {
  label: string;
  text: string;
}

export interface ClinicalCaseQuizQuestion {
  id: string;
  prompt: string;
  options: ClinicalCaseQuizOption[];
  hint: string | null;
}

export interface ClinicalCaseAnswerFeedback {
  question_id: string;
  selected_option_label: string;
  is_correct: boolean;
  correct_option_label: string;
  explanation: string;
}

export interface ClinicalCaseListItem {
  slug: string;
  title: string;
  subtitle: string | null;
  section_name: string;
  topic_name: string;
  difficulty: string;
  duration_minutes: number;
  summary: string;
  focus_points: string[];
  exam_targets: string[];
  topic_id: number | null;
}

export interface ClinicalCaseDetail extends ClinicalCaseListItem {
  patient_summary: string;
  discussion_questions: string[];
  quiz_questions: ClinicalCaseQuizQuestion[];
  clinical_facts: ClinicalCaseFact[];
}

export interface ClinicalCaseCompletionResponse {
  attempt_id: string;
  simulation_id: string | null;
  attempt_context: string;
  recorded: boolean;
  task_completed: boolean;
  answered_questions: number;
  correct_answers: number;
  total_questions: number;
  accuracy_percent: number;
  feedback: ClinicalCaseAnswerFeedback[];
}

export interface ClinicalCaseAttemptStartResponse {
  attempt_id: string;
  simulation_id: string | null;
  attempt_context: string;
  case_slug: string;
  mode: "study" | "exam" | string;
  started_at: string;
  expires_at: string;
  duration_seconds: number;
  server_time: string;
}

export interface OsceChecklistItem {
  id: string;
  title: string;
  description: string;
  critical: boolean;
}

export interface OsceQuizOption {
  label: string;
  text: string;
}

export interface OsceQuizQuestion {
  id: string;
  prompt: string;
  options: OsceQuizOption[];
}

export interface OsceAttemptHistoryItem {
  id: string;
  attempt_context: string;
  checklist_score_percent: number;
  quiz_score_percent: number;
  total_score_percent: number;
  score_points: number;
  checklist_completed_count: number;
  checklist_total_count: number;
  quiz_correct_answers: number;
  quiz_total_questions: number;
  submitted_at: string;
}

export interface OsceStationListItem {
  slug: string;
  title: string;
  subtitle: string | null;
  section_name: string;
  topic_name: string;
  skill_level: string;
  duration_minutes: number;
  max_score: number;
  summary: string;
  best_score_percent: number | null;
  best_score_points: number | null;
  attempts_count: number;
  status: string;
}

export interface OsceStationDetail extends OsceStationListItem {
  checklist_items: OsceChecklistItem[];
  quiz_questions: OsceQuizQuestion[];
  attempts: OsceAttemptHistoryItem[];
}

export interface OsceQuizFeedback {
  question_id: string;
  is_correct: boolean;
  correct_option_label: string;
  explanation: string;
}

export interface OsceAttemptSubmitResponse extends OsceAttemptHistoryItem {
  station_slug: string;
  station_title: string;
  quiz_feedback: OsceQuizFeedback[];
}

export interface OsceAttemptStartResponse {
  attempt_id: string;
  simulation_id: string | null;
  attempt_context: string;
  station_slug: string;
  started_at: string;
  expires_at: string;
  duration_seconds: number;
  server_time: string;
}

export interface PlanTask {
  id: number;
  scheduled_date: string;
  task_type: string;
  task_variant: string;
  intent: "training" | "control" | "exam_checkpoint" | string;
  exam_checkpoint_type: "test_stage" | "case_stage" | "osce_stage" | string | null;
  target_route: "learning_center" | "cases" | "osce" | "accreditation_center" | string;
  completion_source: string | null;
  linked_simulation_id: string | null;
  title: string;
  topic_id: number | null;
  topic_name: string | null;
  osce_station_slug: string | null;
  questions_count: number;
  estimated_minutes: number;
  is_completed: boolean;
  is_skipped: boolean;
  is_stale: boolean;
  missed_at: string | null;
  missed_reason: string | null;
  planner_reason?: string | null;
}

export interface PlanEventItem {
  id: number;
  event_type: string;
  tone: "default" | "accent" | "green" | "warm";
  title: string;
  description: string;
  created_at: string;
}

export interface ScheduleResponse {
  days_until_accreditation: number | null;
  server_today: string;
  daily_study_seconds: number;
  today_study_seconds: number;
  remaining_study_seconds: number;
  tasks: PlanTask[];
  events: PlanEventItem[];
}

export interface ScheduleTodayResponse {
  scheduled_date: string;
  server_today: string;
  daily_study_seconds: number;
  today_study_seconds: number;
  remaining_study_seconds: number;
  tasks: PlanTask[];
}

export interface AnalyticsOverview {
  total_answered: number;
  correct_answers: number;
  accuracy_percent: number;
  completed_sessions: number;
  streak_days: number;
  days_until_accreditation: number | null;
}

export interface ReadinessTrack {
  key: string;
  label: string;
  readiness_percent: number;
  deficit_percent: number;
  status: string;
  detail: string;
  coverage_percent: number;
  freshness_percent: number;
  consistency_percent: number;
  volume_percent: number;
  momentum_percent: number;
}

export interface ReadinessSummary {
  overall_readiness_percent: number;
  recommended_focus_key: string;
  recommended_focus_label: string;
  tracks: ReadinessTrack[];
  exam_protocol: ExamReadinessProtocol;
}

export interface ExamStageProtocol {
  key: string;
  label: string;
  status: "passed" | "failed" | "unconfirmed" | string;
  status_label: string;
  result_label: string;
  requirement_label: string;
  detail: string;
}

export interface ExamReadinessProtocol {
  overall_status: "ready" | "not_ready" | string;
  overall_status_label: string;
  summary: string;
  stages: ExamStageProtocol[];
  action_items: string[];
}

export interface ExamSimulationStage {
  key: "tests" | "cases" | "osce" | string;
  status: string;
  score_percent: number | null;
  passed: boolean | null;
  details: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
}

export interface ExamSimulation {
  id: string;
  simulation_type: string;
  status: string;
  score_percent: number | null;
  passed: boolean | null;
  started_at: string | null;
  expires_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
  stages: ExamSimulationStage[];
}

export interface TopicAnalytics {
  topic_id: number;
  topic_name: string;
  section_name: string;
  answered_questions: number;
  correct_answers: number;
  test_incorrect_answers: number;
  accuracy_percent: number;
  status: string;
  case_attempts_count: number;
  repeated_question_struggles: number;
  hard_question_accuracy_percent: number | null;
  last_activity_at: string | null;
  recent_struggle_at: string | null;
}

export interface TopicQuestionErrorOption {
  label: string;
  text: string;
}

export interface TopicQuestionErrorAnalytics {
  question_id: number;
  question_text: string;
  difficulty: string;
  attempts_count: number;
  incorrect_answers: number;
  correct_answers: number;
  accuracy_percent: number;
  last_seen_at: string;
  last_incorrect_at: string | null;
  last_selected_option_label: string | null;
  last_selected_option_text: string | null;
  correct_option_label: string | null;
  correct_option_text: string | null;
  explanation: string | null;
  answer_options: TopicQuestionErrorOption[];
}

export interface ClinicalCaseAttemptAnalytics {
  id: string;
  case_slug: string;
  case_title: string;
  topic_id: number | null;
  topic_name: string | null;
  answered_questions: number;
  correct_answers: number;
  accuracy_percent: number;
  study_minutes: number;
  submitted_at: string;
}

export interface ClinicalCaseAttemptReviewItemAnalytics {
  question_id: string;
  prompt: string;
  selected_option_label: string | null;
  selected_option_text: string | null;
  correct_option_label: string | null;
  correct_option_text: string | null;
  explanation: string | null;
}

export interface ClinicalCaseAttemptReviewAnalytics {
  attempt_id: string;
  case_slug: string;
  case_title: string;
  topic_name: string | null;
  accuracy_percent: number;
  correct_answers: number;
  answered_questions: number;
  study_minutes: number;
  submitted_at: string;
  patient_summary: string;
  focus_points: string[];
  exam_targets: string[];
  review_available: boolean;
  incorrect_items: ClinicalCaseAttemptReviewItemAnalytics[];
}

export interface RepeatingQuestionErrorAnalytics {
  question_id: number;
  question_preview: string;
  difficulty: string;
  topic_id: number | null;
  topic_name: string | null;
  section_name: string | null;
  attempts_count: number;
  incorrect_answers: number;
  accuracy_percent: number;
  last_seen_at: string;
  last_incorrect_at: string | null;
}

export interface OsceStationChecklistGapAnalytics {
  id: string;
  title: string;
  description: string;
  critical: boolean;
}

export interface OsceStationQuizMistakeAnalytics {
  question_id: string;
  prompt: string;
  selected_option_label: string | null;
  selected_option_text: string | null;
  correct_option_label: string | null;
  correct_option_text: string | null;
  explanation: string | null;
}

export interface OsceStationReviewAnalytics {
  station_slug: string;
  station_title: string;
  section_name: string;
  topic_name: string;
  status: string;
  attempts_count: number;
  best_score_percent: number | null;
  latest_attempt_submitted_at: string | null;
  latest_total_score_percent: number | null;
  latest_checklist_score_percent: number | null;
  latest_quiz_score_percent: number | null;
  missed_checklist_items: OsceStationChecklistGapAnalytics[];
  incorrect_quiz_items: OsceStationQuizMistakeAnalytics[];
}

export interface DailyAnalytics {
  stat_date: string;
  questions_answered: number;
  correct_answers: number;
  accuracy_percent: number;
  study_minutes: number;
}

export interface AnswerOption {
  label: string;
  text: string;
}

export interface Question {
  id: number;
  topic_id: number | null;
  text: string;
  difficulty: string;
  answer_options: AnswerOption[];
}

export interface TestSession {
  id: string;
  simulation_id: string | null;
  attempt_context: string;
  mode: string;
  status: string;
  topic_id: number | null;
  total_questions: number;
  current_index: number;
  time_limit_minutes: number | null;
  questions: Question[];
  answers: TestSessionAnswerResponse[];
}

export interface TestSessionAnswerResponse {
  question_id: number;
  selected_option_label: string;
  is_correct: boolean | null;
  correct_option_label: string | null;
  explanation: string | null;
}

export interface TestSessionFinishResponse {
  session_id: string;
  simulation_id: string | null;
  attempt_context: string;
  score_percent: number;
  correct_answers: number;
  answered_questions: number;
  total_questions: number;
  status: string;
  answers: TestSessionAnswerResponse[];
}

export interface AdminQuestionListItem {
  id: number;
  faculty_id: number | null;
  faculty_name: string | null;
  section_id: number | null;
  section_name: string | null;
  topic_id: number | null;
  topic_name: string | null;
  text: string;
  difficulty: string;
  is_active: boolean;
  answer_option_count: number;
}

export interface AdminQuestionListResponse {
  items: AdminQuestionListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminAnswerOptionItem {
  id: number;
  label: string;
  text: string;
  is_correct: boolean;
  explanation: string | null;
}

export interface AdminQuestionDetails {
  id: number;
  faculty_id: number | null;
  faculty_name: string | null;
  section_id: number | null;
  section_name: string | null;
  topic_id: number | null;
  topic_name: string | null;
  text: string;
  difficulty: string;
  explanation: string | null;
  is_active: boolean;
  created_by: number | null;
  answer_options: AdminAnswerOptionItem[];
}

export interface AdminAnswerOptionWriteInput {
  label: string;
  text: string;
  is_correct: boolean;
  explanation?: string | null;
}

export interface AdminQuestionWriteInput {
  topic_id: number;
  text: string;
  difficulty: string;
  explanation?: string | null;
  answer_options: AdminAnswerOptionWriteInput[];
  is_active: boolean;
}

export interface AdminQuestionDeleteResult {
  id: number;
  deleted: boolean;
}

export interface ImportFileItem {
  file_name: string;
  size_bytes: number;
}

export interface QuestionImportResult {
  file_name: string;
  created_questions: number;
  updated_questions: number;
  created_sections: number;
  created_topics: number;
}

export interface QuestionImportValidationIssue {
  row_number: number | null;
  message: string;
}

export interface QuestionImportValidationResult {
  file_name: string;
  can_import: boolean;
  row_count: number;
  valid_row_count: number;
  issue_count: number;
  issues: QuestionImportValidationIssue[];
  faculties: string[];
  section_count: number;
  topic_count: number;
  difficulty_counts: Record<string, number>;
}

export interface AdminContentCoverageTargets {
  active_question_count: number;
  case_count: number;
  case_quiz_question_count: number;
  osce_station_count: number;
}

export interface AdminContentCoverageTotals {
  active_question_count: number;
  inactive_question_count: number;
  case_count: number;
  case_quiz_question_count: number;
  osce_station_count: number;
  osce_checklist_item_count: number;
  osce_quiz_question_count: number;
}

export interface AdminContentCoverageTopic extends AdminContentCoverageTotals {
  topic_id: number;
  topic_name: string;
  section_id: number;
  section_name: string;
}

export interface AdminContentCoverageSection extends AdminContentCoverageTotals {
  section_id: number;
  section_name: string;
  topics: AdminContentCoverageTopic[];
}

export interface AdminContentCoverageFaculty extends AdminContentCoverageTotals {
  faculty_id: number;
  faculty_code: string;
  faculty_name: string;
  strict_simulation_ready: boolean;
  gaps: string[];
  sections: AdminContentCoverageSection[];
}

export interface AdminContentCoverage {
  targets: AdminContentCoverageTargets;
  totals: AdminContentCoverageTotals;
  faculties: AdminContentCoverageFaculty[];
}

export interface AdminStudentProgress {
  overall_percent: number;
  tests_percent: number;
  cases_percent: number;
  osce_percent: number;
  protocol_status: "not_started" | "in_progress" | "risk" | "ready" | string;
  protocol_label: string;
  latest_simulation_status: string | null;
  latest_simulation_score_percent: number | null;
  latest_simulation_started_at: string | null;
  latest_simulation_finished_at: string | null;
}

export interface AdminStudentListItem {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  faculty_id: number | null;
  faculty_name: string | null;
  accreditation_date: string | null;
  onboarding_completed: boolean;
  created_at: string;
  last_login_at: string | null;
  last_activity_date: string | null;
  progress: AdminStudentProgress;
}

export interface AdminStudentListResponse {
  items: AdminStudentListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminClinicalCaseFact {
  label: string;
  value: string;
  tone: string | null;
}

export interface AdminClinicalCaseQuizOption {
  label: string;
  text: string;
}

export interface AdminClinicalCaseQuizQuestion {
  id: string;
  prompt: string;
  options: AdminClinicalCaseQuizOption[];
  correct_option_label: string;
  explanation: string;
  hint: string | null;
}

export interface AdminClinicalCaseListItem {
  slug: string;
  faculty_code: string;
  faculty_name: string | null;
  section_name: string;
  topic_id: number | null;
  topic_name: string;
  title: string;
  subtitle: string | null;
  difficulty: string;
  duration_minutes: number;
  summary: string;
  quiz_questions_count: number;
}

export interface AdminClinicalCaseDetails extends AdminClinicalCaseListItem {
  patient_summary: string;
  focus_points: string[];
  exam_targets: string[];
  discussion_questions: string[];
  quiz_questions: AdminClinicalCaseQuizQuestion[];
  clinical_facts: AdminClinicalCaseFact[];
}

export interface AdminClinicalCaseWriteInput {
  slug: string;
  topic_id: number;
  title: string;
  subtitle?: string | null;
  difficulty: string;
  duration_minutes: number;
  summary: string;
  patient_summary: string;
  focus_points: string[];
  exam_targets: string[];
  discussion_questions: string[];
  quiz_questions: AdminClinicalCaseQuizQuestion[];
  clinical_facts: AdminClinicalCaseFact[];
}

export interface AdminOsceOptionItem {
  label: string;
  text: string;
}

export interface AdminOsceQuestionItem {
  id: string;
  prompt: string;
  options: AdminOsceOptionItem[];
  correct_option_label: string;
  explanation: string;
}

export interface AdminOsceChecklistItem {
  id: string;
  title: string;
  description: string;
  critical: boolean;
}

export interface AdminOsceStationListItem {
  slug: string;
  faculty_code: string;
  faculty_name: string | null;
  section_name: string;
  topic_id: number | null;
  topic_name: string;
  title: string;
  subtitle: string | null;
  skill_level: string;
  duration_minutes: number;
  max_score: number;
  summary: string;
  checklist_items_count: number;
  quiz_questions_count: number;
}

export interface AdminOsceStationDetails extends AdminOsceStationListItem {
  checklist_items: AdminOsceChecklistItem[];
  quiz_questions: AdminOsceQuestionItem[];
}

export interface AdminOsceQuestionWriteInput {
  id: string;
  prompt: string;
  options: AdminOsceOptionItem[];
  correct_option_label: string;
  explanation: string;
}

export interface AdminOsceStationWriteInput {
  slug: string;
  topic_id: number;
  title: string;
  subtitle?: string | null;
  skill_level: string;
  duration_minutes: number;
  max_score: number;
  summary: string;
  checklist_items: AdminOsceChecklistItem[];
  quiz_questions: AdminOsceQuestionWriteInput[];
}
