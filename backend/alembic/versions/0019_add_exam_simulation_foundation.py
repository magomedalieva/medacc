from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0019_exam_simulation_foundation"
down_revision: Union[str, Sequence[str], None] = "0018_plan_task_missed_state"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exam_simulations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("simulation_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("score_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("passed", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_exam_simulations_user_id", "exam_simulations", ["user_id"], unique=False)
    op.create_index(
        "ix_exam_simulations_user_type_status",
        "exam_simulations",
        ["user_id", "simulation_type", "status"],
        unique=False,
    )
    op.create_index(
        "ix_exam_simulations_user_created_at",
        "exam_simulations",
        ["user_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "exam_simulation_stages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("simulation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("stage_key", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("score_percent", sa.Numeric(5, 2), nullable=True),
        sa.Column("passed", sa.Boolean(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["simulation_id"], ["exam_simulations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_exam_simulation_stages_simulation_id",
        "exam_simulation_stages",
        ["simulation_id"],
        unique=False,
    )
    op.create_index(
        "ix_exam_simulation_stages_simulation_stage",
        "exam_simulation_stages",
        ["simulation_id", "stage_key"],
        unique=True,
    )

    op.add_column("plan_tasks", sa.Column("intent", sa.String(length=30), nullable=False, server_default="training"))
    op.add_column("plan_tasks", sa.Column("exam_checkpoint_type", sa.String(length=40), nullable=True))
    op.add_column(
        "plan_tasks",
        sa.Column("target_route", sa.String(length=40), nullable=False, server_default="learning_center"),
    )
    op.add_column("plan_tasks", sa.Column("completion_source", sa.String(length=40), nullable=True))
    op.add_column("plan_tasks", sa.Column("linked_simulation_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_plan_tasks_linked_simulation_id_exam_simulations",
        "plan_tasks",
        "exam_simulations",
        ["linked_simulation_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_plan_tasks_linked_simulation_id", "plan_tasks", ["linked_simulation_id"], unique=False)
    op.execute("UPDATE plan_tasks SET target_route = 'cases' WHERE task_type = 'case'")
    op.execute("UPDATE plan_tasks SET target_route = 'osce' WHERE task_type = 'osce'")
    op.execute(
        """
        UPDATE plan_tasks
        SET intent = 'exam_checkpoint',
            exam_checkpoint_type = 'test_stage',
            target_route = 'accreditation_center'
        WHERE task_type = 'exam_sim'
        """
    )

    for table_name in (
        "test_sessions",
        "clinical_case_exam_sessions",
        "clinical_case_attempts",
        "osce_exam_sessions",
        "osce_attempts",
    ):
        op.add_column(table_name, sa.Column("simulation_id", postgresql.UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(
            f"fk_{table_name}_simulation_id_exam_simulations",
            table_name,
            "exam_simulations",
            ["simulation_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(f"ix_{table_name}_simulation_id", table_name, ["simulation_id"], unique=False)


def downgrade() -> None:
    for table_name in (
        "osce_attempts",
        "osce_exam_sessions",
        "clinical_case_attempts",
        "clinical_case_exam_sessions",
        "test_sessions",
    ):
        op.drop_index(f"ix_{table_name}_simulation_id", table_name=table_name)
        op.drop_constraint(f"fk_{table_name}_simulation_id_exam_simulations", table_name, type_="foreignkey")
        op.drop_column(table_name, "simulation_id")

    op.drop_index("ix_plan_tasks_linked_simulation_id", table_name="plan_tasks")
    op.drop_constraint("fk_plan_tasks_linked_simulation_id_exam_simulations", "plan_tasks", type_="foreignkey")
    op.drop_column("plan_tasks", "linked_simulation_id")
    op.drop_column("plan_tasks", "completion_source")
    op.drop_column("plan_tasks", "target_route")
    op.drop_column("plan_tasks", "exam_checkpoint_type")
    op.drop_column("plan_tasks", "intent")

    op.drop_index("ix_exam_simulation_stages_simulation_stage", table_name="exam_simulation_stages")
    op.drop_index("ix_exam_simulation_stages_simulation_id", table_name="exam_simulation_stages")
    op.drop_table("exam_simulation_stages")

    op.drop_index("ix_exam_simulations_user_created_at", table_name="exam_simulations")
    op.drop_index("ix_exam_simulations_user_type_status", table_name="exam_simulations")
    op.drop_index("ix_exam_simulations_user_id", table_name="exam_simulations")
    op.drop_table("exam_simulations")
