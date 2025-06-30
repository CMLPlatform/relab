"""Common routers dependencies."""

from typing import Annotated

from fastapi import Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.database import get_async_session

# FastAPI dependency for getting an asynchronous database session
AsyncSessionDep = Annotated[AsyncSession, Depends(get_async_session)]
