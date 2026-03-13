from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from config.paths import DATA_DIR

DATABASE_URL = f"sqlite+aiosqlite:///{DATA_DIR}/attendance.db"

engine = create_async_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # Needed for SQLite
    pool_size=20,  # Increased for higher concurrency
    max_overflow=20,
    pool_timeout=30,  # Wait up to 30s before failing
    echo=False,
)

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
