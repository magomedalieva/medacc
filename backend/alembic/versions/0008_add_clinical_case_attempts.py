from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0008_add_clinical_case_attempts"
down_revision: Union[str, Sequence[str], None] = "0007_add_case_plan_tasks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "clinical_case_attempts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("case_slug", sa.String(length=120), nullable=False),
        sa.Column("case_title", sa.String(length=255), nullable=False),
        sa.Column("topic_id", sa.Integer(), nullable=True),
        sa.Column("answered_questions", sa.Integer(), nullable=False),
        sa.Column("correct_answers", sa.Integer(), nullable=False),
        sa.Column("accuracy_percent", sa.Numeric(5, 2), nullable=False),
        sa.Column("study_minutes", sa.Integer(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_clinical_case_attempts_user_id", "clinical_case_attempts", ["user_id"], unique=False)
    op.create_index("ix_clinical_case_attempts_case_slug", "clinical_case_attempts", ["case_slug"], unique=False)
    op.create_index("ix_clinical_case_attempts_topic_id", "clinical_case_attempts", ["topic_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_clinical_case_attempts_topic_id", table_name="clinical_case_attempts")
    op.drop_index("ix_clinical_case_attempts_case_slug", table_name="clinical_case_attempts")
    op.drop_index("ix_clinical_case_attempts_user_id", table_name="clinical_case_attempts")
    op.drop_table("clinical_case_attempts")
