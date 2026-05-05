from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0013_content_tables"
down_revision: Union[str, Sequence[str], None] = "0012_task_variant"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "clinical_cases",
        sa.Column("slug", sa.String(length=120), primary_key=True),
        sa.Column("topic_id", sa.Integer(), nullable=True),
        sa.Column("faculty_codes", sa.JSON(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("subtitle", sa.String(length=255), nullable=True),
        sa.Column("section_name", sa.String(length=100), nullable=False),
        sa.Column("topic_name", sa.String(length=150), nullable=False),
        sa.Column("difficulty", sa.String(length=100), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("patient_summary", sa.Text(), nullable=False),
        sa.Column("focus_points", sa.JSON(), nullable=False),
        sa.Column("exam_targets", sa.JSON(), nullable=False),
        sa.Column("discussion_questions", sa.JSON(), nullable=False),
        sa.Column("clinical_facts", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_clinical_cases_topic_id", "clinical_cases", ["topic_id"], unique=False)

    op.create_table(
        "osce_stations",
        sa.Column("slug", sa.String(length=120), primary_key=True),
        sa.Column("topic_id", sa.Integer(), nullable=True),
        sa.Column("faculty_codes", sa.JSON(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("subtitle", sa.String(length=255), nullable=True),
        sa.Column("section_name", sa.String(length=100), nullable=False),
        sa.Column("topic_name", sa.String(length=150), nullable=False),
        sa.Column("skill_level", sa.String(length=100), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("max_score", sa.Integer(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("checklist_items", sa.JSON(), nullable=False),
        sa.Column("quiz_questions", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_osce_stations_topic_id", "osce_stations", ["topic_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_osce_stations_topic_id", table_name="osce_stations")
    op.drop_table("osce_stations")
    op.drop_index("ix_clinical_cases_topic_id", table_name="clinical_cases")
    op.drop_table("clinical_cases")
