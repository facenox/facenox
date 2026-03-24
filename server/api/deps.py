from typing import AsyncGenerator, Annotated, Optional
from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession
from database.session import AsyncSessionLocal
from database.repository import AttendanceRepository


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


def normalize_organization_id(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


async def get_organization_id(
    x_facenox_organization: Annotated[
        Optional[str], Header(alias="X-Facenox-Organization")
    ] = None,
) -> Optional[str]:
    return normalize_organization_id(x_facenox_organization)


async def get_repository(
    session: Annotated[AsyncSession, Depends(get_db)],
    organization_id: Annotated[Optional[str], Depends(get_organization_id)],
) -> AttendanceRepository:
    return AttendanceRepository(session, organization_id=organization_id)
