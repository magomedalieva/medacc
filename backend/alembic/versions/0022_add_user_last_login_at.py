from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0022_add_user_last_login_at"
down_revision: Union[str, Sequence[str], None] = "0021_add_attempt_context"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_users_last_login_at", "users", ["last_login_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_users_last_login_at", table_name="users")
    op.drop_column("users", "last_login_at")
