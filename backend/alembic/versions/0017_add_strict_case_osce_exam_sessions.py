from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0017_strict_exam_sessions"
down_revision: Union[str, Sequence[str], None] = "0016_case_attempt_feedback"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "clinical_case_exam_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("case_slug", sa.String(length=120), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=True),
        sa.Column("planned_task_id", sa.Integer(), nullable=True),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["planned_task_id"], ["plan_tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_clinical_case_exam_sessions_case_slug",
        "clinical_case_exam_sessions",
        ["case_slug"],
        unique=False,
    )
    op.create_index(
        "ix_clinical_case_exam_sessions_planned_task_id",
        "clinical_case_exam_sessions",
        ["planned_task_id"],
        unique=False,
    )
    op.create_index(
        "ix_clinical_case_exam_sessions_topic_id",
        "clinical_case_exam_sessions",
        ["topic_id"],
        unique=False,
    )
    op.create_index(
        "ix_clinical_case_exam_sessions_user_case_status",
        "clinical_case_exam_sessions",
        ["user_id", "case_slug", "status"],
        unique=False,
    )
    op.create_index(
        "ix_clinical_case_exam_sessions_user_expires_at",
        "clinical_case_exam_sessions",
        ["user_id", "expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_clinical_case_exam_sessions_user_id",
        "clinical_case_exam_sessions",
        ["user_id"],
        unique=False,
    )

    op.create_table(
        "osce_exam_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("station_slug", sa.String(length=120), nullable=False),
        sa.Column("planned_task_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["planned_task_id"], ["plan_tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_osce_exam_sessions_planned_task_id", "osce_exam_sessions", ["planned_task_id"], unique=False)
    op.create_index("ix_osce_exam_sessions_station_slug", "osce_exam_sessions", ["station_slug"], unique=False)
    op.create_index(
        "ix_osce_exam_sessions_user_expires_at",
        "osce_exam_sessions",
        ["user_id", "expires_at"],
        unique=False,
    )
    op.create_index("ix_osce_exam_sessions_user_id", "osce_exam_sessions", ["user_id"], unique=False)
    op.create_index(
        "ix_osce_exam_sessions_user_station_status",
        "osce_exam_sessions",
        ["user_id", "station_slug", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_osce_exam_sessions_user_station_status", table_name="osce_exam_sessions")
    op.drop_index("ix_osce_exam_sessions_user_id", table_name="osce_exam_sessions")
    op.drop_index("ix_osce_exam_sessions_user_expires_at", table_name="osce_exam_sessions")
    op.drop_index("ix_osce_exam_sessions_station_slug", table_name="osce_exam_sessions")
    op.drop_index("ix_osce_exam_sessions_planned_task_id", table_name="osce_exam_sessions")
    op.drop_table("osce_exam_sessions")

    op.drop_index("ix_clinical_case_exam_sessions_user_id", table_name="clinical_case_exam_sessions")
    op.drop_index("ix_clinical_case_exam_sessions_user_expires_at", table_name="clinical_case_exam_sessions")
    op.drop_index("ix_clinical_case_exam_sessions_user_case_status", table_name="clinical_case_exam_sessions")
    op.drop_index("ix_clinical_case_exam_sessions_topic_id", table_name="clinical_case_exam_sessions")
    op.drop_index("ix_clinical_case_exam_sessions_planned_task_id", table_name="clinical_case_exam_sessions")
    op.drop_index("ix_clinical_case_exam_sessions_case_slug", table_name="clinical_case_exam_sessions")
    op.drop_table("clinical_case_exam_sessions")
