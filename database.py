import os
from collections.abc import Generator
from pathlib import Path
from urllib.parse import quote_plus

from pymongo import MongoClient
from pymongo.database import Database as MongoDatabase
from redis import Redis
from sqlalchemy import create_engine
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Compose supplies PostgreSQL connection fields separately so special characters
# in credentials are escaped correctly when SQLAlchemy builds the connection URL.
DATABASE_URL = os.getenv("DATABASE_URL") or URL.create(
    "postgresql+psycopg",
    username=os.getenv("POSTGRES_USER", "postgre"),
    password=os.getenv("POSTGRES_PASSWORD", "secretpass"),
    host=os.getenv("POSTGRES_HOST", "localhost"),
    port=int(os.getenv("POSTGRES_PORT", "5432")),
    database=os.getenv("POSTGRES_DB", "databix_hot"),
)


database_url = make_url(DATABASE_URL)

# Automatically handle directory scaffolding for SQLite database paths.
if database_url.get_backend_name() == "sqlite" and database_url.database not in (
    None,
    ":memory:",
):
    Path(database_url.database).parent.mkdir(parents=True, exist_ok=True)

# 2. Modern Engine Configuration: Added pool_pre_ping for production robustness
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
    if database_url.get_backend_name() == "sqlite"
    else {},
    pool_pre_ping=True  # Automatically tests connections before giving them to routes
)

# Explicitly typing the sessionmaker factory helps IDEs/Gemini with autocomplete
SessionLocal: sessionmaker[Session] = sessionmaker(bind=engine, autoflush=False, autocommit=False)


# 3. Modern SQLAlchemy Base
class Base(DeclarativeBase):
    pass


# Clean Dependency injection generator for relational routes
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# 4. MongoDB Initialization Core
MONGO_URI = os.getenv("MONGODB_URI") or None
if MONGO_URI is None:
    mongo_username = quote_plus(os.getenv("MONGO_ROOT_USERNAME", "root"), safe="")
    mongo_password = quote_plus(os.getenv("MONGO_ROOT_PASSWORD", "secretpassword"), safe="")
    MONGO_URI = f"mongodb://{mongo_username}:{mongo_password}@mongodb:27017"
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "databix")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

mongo_client: MongoClient = MongoClient(
    MONGO_URI,
    serverSelectionTimeoutMS=2000,
)
redis_client: Redis = Redis.from_url(REDIS_URL, decode_responses=True)


def get_mongo_database() -> MongoDatabase:
    return mongo_client[MONGODB_DATABASE]


def get_redis_client() -> Redis:
    return redis_client


# Generator style matches get_db structure, facilitating cleaner FastAPI testing
def get_mongo_db() -> Generator[MongoDatabase, None, None]:
    try:
        yield get_mongo_database()
    finally:
        # PyMongo handles internal connection pooling seamlessly.
        # We don't close the entire client here, just yield the database instance context.
        pass
