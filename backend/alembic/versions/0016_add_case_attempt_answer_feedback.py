from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0016_case_attempt_feedback"
down_revision: Union[str, Sequence[str], None] = "0015_analytics_perf_indexes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "clinical_case_attempts",
        sa.Column("answer_feedback", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
    )
    op.alter_column("clinical_case_attempts", "answer_feedback", server_default=None)


def downgrade() -> None:
    op.drop_column("clinical_case_attempts", "answer_feedback")
