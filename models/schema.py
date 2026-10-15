from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import DBAPIError


def _has_column(engine: Engine, table: str, column: str) -> bool:
    return column in {item["name"] for item in inspect(engine).get_columns(table)}


def upgrade_schema(engine: Engine) -> None:
    """Add columns introduced after a table was first created by create_all.

    create_all never alters existing tables, so databases created before the
    admin role existed need the column added in place.
    """
    if "users" not in inspect(engine).get_table_names():
        return
    if _has_column(engine, "users", "is_admin"):
        return
    try:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE")
            )
    except DBAPIError:
        # API startup and `python -m auth.manage` can race to add the column;
        # losing that race is fine as long as the column now exists.
        if not _has_column(engine, "users", "is_admin"):
            raise
