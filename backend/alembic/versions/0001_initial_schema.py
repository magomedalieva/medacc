from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0001_initial_schema"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


user_role = sa.Enum("student", "admin", name="user_role")
question_difficulty = sa.Enum("easy", "medium", "hard", name="question_difficulty")
test_session_mode = sa.Enum("learning", "exam", name="test_session_mode")
test_session_status = sa.Enum("active", "finished", name="test_session_status")


def upgrade() -> None:
    op.create_table(
        "faculties",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("name", name="uq_faculties_name"),
        sa.UniqueConstraint("code", name="uq_faculties_code"),
    )
    op.create_index("ix_faculties_code", "faculties", ["code"], unique=False)

    op.create_table(
        "sections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("faculty_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["faculty_id"], ["faculties.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_sections_faculty_id", "sections", ["faculty_id"], unique=False)

    op.create_table(
        "topics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["section_id"], ["sections.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_topics_section_id", "topics", ["section_id"], unique=False)

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("first_name", sa.String(length=50), nullable=False),
        sa.Column("last_name", sa.String(length=50), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("role", user_role, nullable=False, server_default="student"),
        sa.Column("faculty_id", sa.Integer(), nullable=True),
        sa.Column("accreditation_date", sa.Date(), nullable=True),
        sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("streak_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_activity_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["faculty_id"], ["faculties.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("email", name="uq_users_email"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=False)

    op.create_table(
        "questions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("topic_id", sa.Integer(), nullable=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("difficulty", question_difficulty, nullable=False, server_default="medium"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_questions_topic_id", "questions", ["topic_id"], unique=False)

    op.create_table(
        "answer_options",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=1), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("is_correct", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_answer_options_question_id", "answer_options", ["question_id"], unique=False)

    op.create_table(
        "question_explanations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("question_id", name="uq_question_explanations_question_id"),
    )
    op.create_index("ix_question_explanations_question_id", "question_explanations", ["question_id"], unique=False)

    op.create_table(
        "test_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("mode", test_session_mode, nullable=False),
        sa.Column("status", test_session_status, nullable=False, server_default="active"),
        sa.Column("topic_id", sa.Integer(), nullable=True),
        sa.Column("question_ids", sa.JSON(), nullable=False),
        sa.Column("total_questions", sa.Integer(), nullable=False),
        sa.Column("current_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("time_limit_minutes", sa.Integer(), nullable=True),
        sa.Column("score_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_test_sessions_user_id", "test_sessions", ["user_id"], unique=False)
    op.create_index("ix_test_sessions_topic_id", "test_sessions", ["topic_id"], unique=False)

    op.create_table(
        "test_session_answers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("question_id", sa.Integer(), nullable=False),
        sa.Column("selected_option_label", sa.String(length=1), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["session_id"], ["test_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["question_id"], ["questions.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("session_id", "question_id", name="uq_test_session_answer"),
    )
    op.create_index("ix_test_session_answers_session_id", "test_session_answers", ["session_id"], unique=False)
    op.create_index("ix_test_session_answers_question_id", "test_session_answers", ["question_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_test_session_answers_question_id", table_name="test_session_answers")
    op.drop_index("ix_test_session_answers_session_id", table_name="test_session_answers")
    op.drop_table("test_session_answers")
    op.drop_index("ix_test_sessions_topic_id", table_name="test_sessions")
    op.drop_index("ix_test_sessions_user_id", table_name="test_sessions")
    op.drop_table("test_sessions")
    op.drop_index("ix_question_explanations_question_id", table_name="question_explanations")
    op.drop_table("question_explanations")
    op.drop_index("ix_answer_options_question_id", table_name="answer_options")
    op.drop_table("answer_options")
    op.drop_index("ix_questions_topic_id", table_name="questions")
    op.drop_table("questions")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    op.drop_index("ix_topics_section_id", table_name="topics")
    op.drop_table("topics")
    op.drop_index("ix_sections_faculty_id", table_name="sections")
    op.drop_table("sections")
    op.drop_index("ix_faculties_code", table_name="faculties")
    op.drop_table("faculties")
