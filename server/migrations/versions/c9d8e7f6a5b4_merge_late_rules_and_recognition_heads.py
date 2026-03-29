"""merge late rules and recognition setting heads

Revision ID: c9d8e7f6a5b4
Revises: b4c5d6e7f8a9, f1a2b3c4d5e6
Create Date: 2026-03-29 16:20:00.000000

"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "c9d8e7f6a5b4"
down_revision: Union[str, Sequence[str], None] = (
    "b4c5d6e7f8a9",
    "f1a2b3c4d5e6",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
