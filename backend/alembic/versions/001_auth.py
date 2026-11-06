"""Add accounts and schema assignments to existing installations.

Revision ID: 001_auth
Revises: None
"""

import sqlalchemy as sa

from alembic import context, op

revision = "001_auth"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Startup already creates these tables on new installations.
    bind = op.get_bind()
    existing = [] if context.is_offline_mode() else sa.inspect(bind).get_table_names()
    if "users" not in existing:
        op.create_table(
            "users",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("username", sa.String(80), unique=True, nullable=False),
            sa.Column("password_hash", sa.String(500), nullable=False),
            sa.Column("role", sa.String(10), nullable=False),
            sa.Column("disabled", sa.Boolean(), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
    if "schema_access" not in existing:
        op.create_table(
            "schema_access",
            sa.Column(
                "user_id",
                sa.String(36),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column("template_id", sa.String(100), primary_key=True),
        )


def downgrade() -> None:
    op.drop_table("schema_access")
    op.drop_table("users")
