from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002_seed_faculties"
down_revision: Union[str, Sequence[str], None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


faculties_table = sa.table(
    "faculties",
    sa.column("name", sa.String(length=100)),
    sa.column("code", sa.String(length=20)),
    sa.column("description", sa.Text()),
)


def upgrade() -> None:
    op.bulk_insert(
        faculties_table,
        [
            {"name": "Лечебное дело", "code": "060101", "description": "Программа подготовки по лечебному делу."},
            {"name": "Педиатрия", "code": "060103", "description": "Программа подготовки по педиатрии."},
            {"name": "Стоматология", "code": "060201", "description": "Программа подготовки по стоматологии."},
            {"name": "Фармация", "code": "060301", "description": "Программа подготовки по фармации."},
            {"name": "Сестринское дело", "code": "060501", "description": "Программа подготовки по сестринскому делу."},
        ],
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM faculties
            WHERE code IN ('060101', '060103', '060201', '060301', '060501')
            """
        )
    )
