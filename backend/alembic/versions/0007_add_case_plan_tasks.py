from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007_add_case_plan_tasks"
down_revision: Union[str, Sequence[str], None] = "0006_add_plan_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


old_plan_task_type = sa.Enum("test", "exam_sim", "osce", name="plan_task_type")
new_plan_task_type = sa.Enum("test", "exam_sim", "case", "osce", name="plan_task_type_new")


def upgrade() -> None:
    bind = op.get_bind()
    new_plan_task_type.create(bind, checkfirst=False)

    op.execute(
        "ALTER TABLE plan_tasks ALTER COLUMN task_type TYPE plan_task_type_new USING task_type::text::plan_task_type_new"
    )
    old_plan_task_type.drop(bind, checkfirst=False)
    op.execute("ALTER TYPE plan_task_type_new RENAME TO plan_task_type")


def downgrade() -> None:
    bind = op.get_bind()
    previous_plan_task_type = sa.Enum("test", "exam_sim", "osce", name="plan_task_type_previous")
    previous_plan_task_type.create(bind, checkfirst=False)

    op.execute("DELETE FROM plan_tasks WHERE task_type = 'case'")
    op.execute(
        "ALTER TABLE plan_tasks ALTER COLUMN task_type TYPE plan_task_type_previous USING task_type::text::plan_task_type_previous"
    )
    sa.Enum("test", "exam_sim", "case", "osce", name="plan_task_type").drop(bind, checkfirst=False)
    op.execute("ALTER TYPE plan_task_type_previous RENAME TO plan_task_type")
