"""Routers for file storage models."""

from fastapi import APIRouter

from app.api.common.routers.openapi import mark_router_routes_public

router = APIRouter(tags=["media"])


mark_router_routes_public(router)
