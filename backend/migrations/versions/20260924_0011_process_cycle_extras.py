from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "7b1c2d3e4f50"
down_revision: str | Sequence[str] | None = "c00efa96dc8a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# These parameters became yes/no: a stored requirement text («EASA/ИКАО», «Да (OSDP)») means «yes».
_NOW_BOOLEAN = ("access_control", "airside_certification", "robot_disinfection")


def upgrade() -> None:
    op.add_column(
        "process_defs",
        sa.Column("cycle_extras", postgresql.JSONB(), server_default="[]", nullable=False),
    )
    op.execute(
        sa.text(
            "UPDATE project_params SET value = to_jsonb(NOT (lower(value #>> '{}') LIKE 'нет%' "
            "OR lower(value #>> '{}') LIKE 'no%')) "
            "WHERE key = ANY(:keys) AND jsonb_typeof(value) = 'string'"
        ).bindparams(sa.bindparam("keys", value=list(_NOW_BOOLEAN), type_=postgresql.ARRAY(sa.String())))
    )


def downgrade() -> None:
    op.drop_column("process_defs", "cycle_extras")
