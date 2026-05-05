from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0009_add_user_study_preferences"
down_revision: Union[str, Sequence[str], None] = "0008_add_clinical_case_attempts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


study_intensity = sa.Enum("gentle", "steady", "intensive", name="study_intensity")


def upgrade() -> None:
    bind = op.get_bind()
    study_intensity.create(bind, checkfirst=False)

    op.add_column(
        "users",
        sa.Column("daily_study_minutes", sa.Integer(), nullable=False, server_default=sa.text("45")),
    )
    op.add_column(
        "users",
        sa.Column(
            "study_intensity",
            study_intensity,
            nullable=False,
            server_default=sa.text("'steady'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "study_intensity")
    op.drop_column("users", "daily_study_minutes")

    bind = op.get_bind()
    study_intensity.drop(bind, checkfirst=False)
