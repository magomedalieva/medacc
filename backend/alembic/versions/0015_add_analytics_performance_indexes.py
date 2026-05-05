from typing import Sequence, Union

from alembic import op


revision: str = "0015_analytics_perf_indexes"
down_revision: Union[str, Sequence[str], None] = "0014_case_quiz_questions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_test_sessions_user_status_mode_finished_at",
        "test_sessions",
        ["user_id", "status", "mode", "finished_at"],
        unique=False,
    )
    op.create_index(
        "ix_clinical_case_attempts_user_submitted_at",
        "clinical_case_attempts",
        ["user_id", "submitted_at"],
        unique=False,
    )
    op.create_index(
        "ix_clinical_case_attempts_user_topic_submitted_at",
        "clinical_case_attempts",
        ["user_id", "topic_id", "submitted_at"],
        unique=False,
    )
    op.create_index(
        "ix_osce_attempts_user_submitted_at",
        "osce_attempts",
        ["user_id", "submitted_at"],
        unique=False,
    )
    op.create_index(
        "ix_osce_attempts_user_station_submitted_at",
        "osce_attempts",
        ["user_id", "station_slug", "submitted_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_osce_attempts_user_station_submitted_at", table_name="osce_attempts")
    op.drop_index("ix_osce_attempts_user_submitted_at", table_name="osce_attempts")
    op.drop_index("ix_clinical_case_attempts_user_topic_submitted_at", table_name="clinical_case_attempts")
    op.drop_index("ix_clinical_case_attempts_user_submitted_at", table_name="clinical_case_attempts")
    op.drop_index("ix_test_sessions_user_status_mode_finished_at", table_name="test_sessions")
