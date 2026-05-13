"""Composed HTTP middleware stack for the backend app."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import Environment, settings
from app.core.http_headers import REQUEST_ID_HEADER
from app.core.middleware.content_negotiation import register_content_negotiation_middleware
from app.core.middleware.method_policy import CORS_HTTP_METHODS, register_method_policy_middleware
from app.core.middleware.request_id import register_request_id_middleware
from app.core.middleware.request_size import register_request_size_limit_middleware
from app.core.middleware.response_policy import register_response_policy_middleware


def register_middleware(app: FastAPI) -> None:
    """Install the backend middleware stack.

    Starlette wraps middleware in reverse registration order, so response
    policy is registered last to become the outermost layer.
    """
    register_request_id_middleware(app)
    register_method_policy_middleware(app)
    register_content_negotiation_middleware(app)
    register_request_size_limit_middleware(app)

    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=settings.allowed_hosts,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=list(CORS_HTTP_METHODS),
        allow_headers=["Authorization", "Content-Type", "Accept", REQUEST_ID_HEADER],
        expose_headers=[REQUEST_ID_HEADER],
    )

    register_response_policy_middleware(
        app,
        enable_hsts=settings.environment in {Environment.STAGING, Environment.PROD},
    )
