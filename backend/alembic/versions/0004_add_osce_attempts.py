from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0004_add_osce_attempts"
down_revision: Union[str, Sequence[str], None] = "0003_add_analytics_and_schedule"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "osce_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("station_slug", sa.String(length=120), nullable=False),
        sa.Column("station_title", sa.String(length=255), nullable=False),
        sa.Column("checklist_item_ids", sa.JSON(), nullable=False),
        sa.Column("quiz_answers", sa.JSON(), nullable=False),
        sa.Column("checklist_completed_count", sa.Integer(), nullable=False),
        sa.Column("checklist_total_count", sa.Integer(), nullable=False),
        sa.Column("quiz_correct_answers", sa.Integer(), nullable=False),
        sa.Column("quiz_total_questions", sa.Integer(), nullable=False),
        sa.Column("checklist_score_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("quiz_score_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("total_score_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("score_points", sa.Integer(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_osce_attempts_user_id", "osce_attempts", ["user_id"], unique=False)
    op.create_index("ix_osce_attempts_station_slug", "osce_attempts", ["station_slug"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_osce_attempts_station_slug", table_name="osce_attempts")
    op.drop_index("ix_osce_attempts_user_id", table_name="osce_attempts")
    op.drop_table("osce_attempts")
