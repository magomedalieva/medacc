from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_add_analytics_and_schedule"
down_revision: Union[str, Sequence[str], None] = "0002_seed_faculties"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


plan_task_type = sa.Enum("test", "exam_sim", name="plan_task_type")


def upgrade() -> None:
    op.create_table(
        "daily_stats",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("stat_date", sa.Date(), nullable=False),
        sa.Column("questions_answered", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("correct_answers", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("study_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "stat_date", name="uq_daily_stats_user_date"),
    )
    op.create_index("ix_daily_stats_user_id", "daily_stats", ["user_id"], unique=False)
    op.create_index("ix_daily_stats_stat_date", "daily_stats", ["stat_date"], unique=False)

    op.create_table(
        "study_plans",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("last_recalculated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", name="uq_study_plans_user_id"),
    )
    op.create_index("ix_study_plans_user_id", "study_plans", ["user_id"], unique=False)

    op.create_table(
        "plan_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("scheduled_date", sa.Date(), nullable=False),
        sa.Column("task_type", plan_task_type, nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=True),
        sa.Column("questions_count", sa.Integer(), nullable=False),
        sa.Column("estimated_minutes", sa.Integer(), nullable=False),
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_skipped", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["plan_id"], ["study_plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_plan_tasks_plan_id", "plan_tasks", ["plan_id"], unique=False)
    op.create_index("ix_plan_tasks_scheduled_date", "plan_tasks", ["scheduled_date"], unique=False)
    op.create_index("ix_plan_tasks_topic_id", "plan_tasks", ["topic_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_plan_tasks_topic_id", table_name="plan_tasks")
    op.drop_index("ix_plan_tasks_scheduled_date", table_name="plan_tasks")
    op.drop_index("ix_plan_tasks_plan_id", table_name="plan_tasks")
    op.drop_table("plan_tasks")
    op.drop_index("ix_study_plans_user_id", table_name="study_plans")
    op.drop_table("study_plans")
    op.drop_index("ix_daily_stats_stat_date", table_name="daily_stats")
    op.drop_index("ix_daily_stats_user_id", table_name="daily_stats")
    op.drop_table("daily_stats")
