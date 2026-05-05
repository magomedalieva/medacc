from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0012_task_variant"
down_revision: Union[str, Sequence[str], None] = "0011_test_session_task"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


plan_task_variant = sa.Enum(
    "standard",
    "final_approach_review",
    "recovery_review",
    "final_week_broad_review",
    "pre_accreditation_review",
    "final_rehearsal_exam",
    "final_rehearsal_case",
    "final_rehearsal_osce",
    "final_phase_case",
    name="plan_task_variant",
)


def upgrade() -> None:
    bind = op.get_bind()
    plan_task_variant.create(bind, checkfirst=True)
    op.add_column(
        "plan_tasks",
        sa.Column(
            "task_variant",
            plan_task_variant,
            nullable=True,
            server_default="standard",
        ),
    )

    op.execute(
        sa.text(
            """
            UPDATE plan_tasks
            SET task_variant = CASE
                WHEN task_type = 'test' AND task_title = 'Калибровочное смешанное повторение' THEN 'final_approach_review'
                WHEN task_type = 'test' AND task_title = 'Восстановительное повторение' THEN 'recovery_review'
                WHEN task_type = 'test' AND task_title = 'Финальное смешанное повторение' THEN 'final_week_broad_review'
                WHEN task_type = 'test' AND task_title = 'Предэкзаменационное закрепление' THEN 'pre_accreditation_review'
                WHEN task_type = 'exam_sim' AND task_title = 'Финальная репетиция: тестовый этап 80/60' THEN 'final_rehearsal_exam'
                WHEN task_type = 'case' AND task_title LIKE 'Финальная репетиция: кейсовый этап - %' THEN 'final_rehearsal_case'
                WHEN task_type = 'osce' AND task_title LIKE 'Финальная репетиция: практический этап - %' THEN 'final_rehearsal_osce'
                WHEN task_type = 'case' AND task_title LIKE 'Экзаменационный кейс: %' THEN 'final_phase_case'
                ELSE 'standard'
            END::plan_task_variant
            """
        )
    )

    op.alter_column("plan_tasks", "task_variant", nullable=False, server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_column("plan_tasks", "task_variant")
    plan_task_variant.drop(bind, checkfirst=True)
