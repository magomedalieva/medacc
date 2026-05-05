from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_add_plan_events"
down_revision: Union[str, Sequence[str], None] = "0005_extend_plan_tasks_for_osce"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "plan_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("tone", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_plan_events_user_id", "plan_events", ["user_id"], unique=False)
    op.create_index("ix_plan_events_created_at", "plan_events", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_plan_events_created_at", table_name="plan_events")
    op.drop_index("ix_plan_events_user_id", table_name="plan_events")
    op.drop_table("plan_events")
