from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005_extend_plan_tasks_for_osce"
down_revision: Union[str, Sequence[str], None] = "0004_add_osce_attempts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


old_plan_task_type = sa.Enum("test", "exam_sim", name="plan_task_type")
new_plan_task_type = sa.Enum("test", "exam_sim", "osce", name="plan_task_type_new")


def upgrade() -> None:
    bind = op.get_bind()
    new_plan_task_type.create(bind, checkfirst=False)

    op.execute(
        "ALTER TABLE plan_tasks ALTER COLUMN task_type TYPE plan_task_type_new USING task_type::text::plan_task_type_new"
    )
    old_plan_task_type.drop(bind, checkfirst=False)
    op.execute("ALTER TYPE plan_task_type_new RENAME TO plan_task_type")

    op.add_column("plan_tasks", sa.Column("task_title", sa.String(length=255), nullable=True))
    op.add_column("plan_tasks", sa.Column("osce_station_slug", sa.String(length=120), nullable=True))
    op.create_index("ix_plan_tasks_osce_station_slug", "plan_tasks", ["osce_station_slug"], unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    previous_plan_task_type = sa.Enum("test", "exam_sim", name="plan_task_type_previous")
    previous_plan_task_type.create(bind, checkfirst=False)

    op.execute("DELETE FROM plan_tasks WHERE task_type = 'osce'")
    op.execute(
        "ALTER TABLE plan_tasks ALTER COLUMN task_type TYPE plan_task_type_previous USING task_type::text::plan_task_type_previous"
    )
    sa.Enum("test", "exam_sim", "osce", name="plan_task_type").drop(bind, checkfirst=False)
    op.execute("ALTER TYPE plan_task_type_previous RENAME TO plan_task_type")

    op.drop_index("ix_plan_tasks_osce_station_slug", table_name="plan_tasks")
    op.drop_column("plan_tasks", "osce_station_slug")
    op.drop_column("plan_tasks", "task_title")
