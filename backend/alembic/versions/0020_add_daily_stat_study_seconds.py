from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0020_daily_stat_study_seconds"
down_revision: Union[str, Sequence[str], None] = "0019_exam_simulation_foundation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "daily_stats",
        sa.Column("study_seconds", sa.Integer(), nullable=False, server_default="0"),
    )
    op.execute("UPDATE daily_stats SET study_seconds = study_minutes * 60 WHERE study_seconds = 0")


def downgrade() -> None:
    op.drop_column("daily_stats", "study_seconds")
