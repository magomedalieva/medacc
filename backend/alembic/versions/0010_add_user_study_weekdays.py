from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0010_add_user_study_weekdays"
down_revision: Union[str, Sequence[str], None] = "0009_add_user_study_preferences"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "study_weekdays",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[0, 1, 2, 3, 4, 5, 6]'::json"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "study_weekdays")
