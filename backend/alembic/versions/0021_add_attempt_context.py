from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0021_add_attempt_context"
down_revision: Union[str, Sequence[str], None] = "0020_daily_stat_study_seconds"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table_name in (
        "test_sessions",
        "clinical_case_exam_sessions",
        "clinical_case_attempts",
        "osce_exam_sessions",
        "osce_attempts",
    ):
        op.add_column(
            table_name,
            sa.Column("attempt_context", sa.String(length=40), nullable=False, server_default="free_training"),
        )
        op.create_index(f"ix_{table_name}_attempt_context", table_name, ["attempt_context"], unique=False)

    op.execute(
        """
        UPDATE test_sessions
        SET attempt_context = CASE
            WHEN simulation_id IS NOT NULL THEN 'strict_simulation'
            WHEN mode = 'exam' AND planned_task_id IS NOT NULL THEN 'planned_control'
            WHEN mode = 'exam' THEN 'control'
            WHEN planned_task_id IS NOT NULL THEN 'planned_training'
            ELSE 'free_training'
        END
        """
    )
    op.execute(
        """
        UPDATE clinical_case_exam_sessions
        SET attempt_context = CASE
            WHEN simulation_id IS NOT NULL THEN 'strict_simulation'
            WHEN mode = 'exam' AND planned_task_id IS NOT NULL THEN 'planned_control'
            WHEN mode = 'exam' THEN 'control'
            WHEN planned_task_id IS NOT NULL THEN 'planned_training'
            ELSE 'free_training'
        END
        """
    )
    op.execute(
        """
        UPDATE clinical_case_attempts
        SET attempt_context = CASE
            WHEN simulation_id IS NOT NULL THEN 'strict_simulation'
            ELSE 'free_training'
        END
        """
    )
    op.execute(
        """
        UPDATE osce_exam_sessions
        SET attempt_context = CASE
            WHEN simulation_id IS NOT NULL THEN 'strict_simulation'
            WHEN planned_task_id IS NOT NULL THEN 'planned_training'
            ELSE 'free_training'
        END
        """
    )
    op.execute(
        """
        UPDATE osce_attempts
        SET attempt_context = CASE
            WHEN simulation_id IS NOT NULL THEN 'strict_simulation'
            ELSE 'free_training'
        END
        """
    )


def downgrade() -> None:
    for table_name in (
        "osce_attempts",
        "osce_exam_sessions",
        "clinical_case_attempts",
        "clinical_case_exam_sessions",
        "test_sessions",
    ):
        op.drop_index(f"ix_{table_name}_attempt_context", table_name=table_name)
        op.drop_column(table_name, "attempt_context")
