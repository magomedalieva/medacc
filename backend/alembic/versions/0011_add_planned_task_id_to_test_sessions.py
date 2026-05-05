from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0011_test_session_task"
down_revision: Union[str, Sequence[str], None] = "0010_add_user_study_weekdays"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("test_sessions", sa.Column("planned_task_id", sa.Integer(), nullable=True))
    op.create_index(op.f("ix_test_sessions_planned_task_id"), "test_sessions", ["planned_task_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_test_sessions_planned_task_id"), table_name="test_sessions")
    op.drop_column("test_sessions", "planned_task_id")
