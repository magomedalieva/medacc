from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0018_plan_task_missed_state"
down_revision: Union[str, Sequence[str], None] = "0017_strict_exam_sessions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "plan_tasks",
        sa.Column("is_stale", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("plan_tasks", sa.Column("missed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("plan_tasks", sa.Column("missed_reason", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("plan_tasks", "missed_reason")
    op.drop_column("plan_tasks", "missed_at")
    op.drop_column("plan_tasks", "is_stale")
