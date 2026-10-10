from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from config.paths import DATA_DIR

DATABASE_URL = f"sqlite+aiosqlite:///{DATA_DIR}/attendance.db"

engine = create_async_engine(
    DATABASE_URL,
    connect_args={
        "check_same_thread": False,  # Needed for SQLite
        "timeout": 30.0,  # 30s driver level lock wait
    },
    echo=False,
)


# Enable SQLite WAL (Write-Ahead Logging) mode and optimize synchronous settings.
# WAL allows concurrent reads and writes, solving common 'database is locked' errors.
@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.execute("PRAGMA wal_autocheckpoint=1000")  # Checkpoint every ~4MB of writes
    cursor.execute("PRAGMA cache_size=-64000")  # 64MB Page Cache
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.close()


AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
