from sqlalchemy import Engine, inspect, text
from sqlalchemy.exc import DBAPIError

# Columns added to existing tables after they were first created. create_all
# never alters existing tables, so older databases get them added in place.
ADDED_COLUMNS: tuple[tuple[str, str, str], ...] = (
    ("users", "is_admin", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("users", "created_at", "TIMESTAMP WITH TIME ZONE"),
    ("users", "last_login_at", "TIMESTAMP WITH TIME ZONE"),
    ("users", "tokens_valid_after", "TIMESTAMP WITH TIME ZONE"),
)


def _has_column(engine: Engine, table: str, column: str) -> bool:
    return column in {item["name"] for item in inspect(engine).get_columns(table)}


def upgrade_schema(engine: Engine) -> None:
    """Add columns introduced after a table was first created by create_all."""
    tables = set(inspect(engine).get_table_names())
    for table, column, definition in ADDED_COLUMNS:
        if table not in tables or _has_column(engine, table, column):
            continue
        try:
            with engine.begin() as connection:
                # Identifiers and definitions come from the constant above, never input.
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}"))
        except DBAPIError:
            # API startup and `python -m auth.manage` can race to add a column;
            # losing that race is fine as long as the column now exists.
            if not _has_column(engine, table, column):
                raise
