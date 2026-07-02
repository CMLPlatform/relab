"""Unit tests for REST content negotiation middleware."""

from __future__ import annotations

from fastapi import FastAPI, Request
from httpx import ASGITransport, AsyncClient

from app.core.middleware.content_negotiation import register_content_negotiation_middleware


def _create_test_app() -> FastAPI:
    app = FastAPI()
    register_content_negotiation_middleware(app)

    @app.post("/v1/json")
    async def json_probe(request: Request) -> dict[str, object]:
        return {"payload": await request.json()}

    @app.post("/v1/form")
    async def form_probe(request: Request) -> dict[str, str]:
        form = await request.form()
        return {"name": str(form["name"])}

    @app.post("/v1/multipart")
    async def multipart_probe(request: Request) -> dict[str, str]:
        return {"content_type": request.headers.get("content-type", "")}

    @app.get("/v1/json")
    async def read_probe() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/v10/json")
    async def non_api_probe(request: Request) -> dict[str, str]:
        return {"content_type": request.headers.get("content-type", "")}

    @app.post("/uploads/file")
    async def upload_skip_probe(request: Request) -> dict[str, str]:
        return {"content_type": request.headers.get("content-type", "")}

    return app


async def test_content_negotiation_accepts_supported_request_content_types() -> None:
    """JSON, form, and multipart requests should pass through."""
    app = _create_test_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        json_response = await client.post("/v1/json", json={"ok": True})
        form_response = await client.post("/v1/form", data={"name": "chair"})
        multipart_response = await client.post(
            "/v1/multipart",
            files={"file": ("sample.txt", b"hello", "text/plain")},
        )

    assert json_response.status_code == 200
    assert form_response.status_code == 200
    assert multipart_response.status_code == 200


async def test_content_negotiation_rejects_body_without_content_type() -> None:
    """Request bodies without Content-Type should receive 415."""
    app = _create_test_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/v1/json", content=b'{"ok": true}')

    assert response.status_code == 415
    assert response.headers["content-type"].startswith("application/problem+json")


async def test_content_negotiation_rejects_unsupported_content_type() -> None:
    """Unsupported request body media types should receive 415."""
    app = _create_test_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/v1/json", content="<ok />", headers={"content-type": "application/xml"})

    assert response.status_code == 415
    assert response.json()["code"] == "UnsupportedMediaType"


async def test_content_negotiation_rejects_unsupported_accept_header() -> None:
    """API requests that cannot accept JSON/problem responses should receive 406."""
    app = _create_test_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/json", headers={"accept": "application/xml"})

    assert response.status_code == 406
    assert response.json()["code"] == "NotAcceptable"


async def test_content_negotiation_ignores_zero_quality_accept_candidates() -> None:
    """Accept candidates with q=0 should not be treated as acceptable."""
    app = _create_test_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/v1/json", headers={"accept": "application/json;q=0.0, application/xml"})

    assert response.status_code == 406


async def test_content_negotiation_accepts_wildcard_json_and_problem_accept_headers() -> None:
    """Wildcard, JSON, and Problem Details Accept headers should pass."""
    app = _create_test_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        wildcard_response = await client.get("/v1/json", headers={"accept": "*/*"})
        json_response = await client.get("/v1/json", headers={"accept": "application/json"})
        problem_response = await client.get("/v1/json", headers={"accept": "application/problem+json"})

    assert wildcard_response.status_code == 200
    assert json_response.status_code == 200
    assert problem_response.status_code == 200


async def test_content_negotiation_skips_upload_paths() -> None:
    """Static upload paths should not be governed by API content negotiation."""
    app = _create_test_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/uploads/file", content=b"raw-bytes", headers={"content-type": "text/plain"})

    assert response.status_code == 200
    assert response.json()["content_type"] == "text/plain"


async def test_content_negotiation_uses_v1_path_boundary() -> None:
    """Paths like /v10 should not be treated as /v1 API routes."""
    app = _create_test_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/v10/json", content=b"raw-bytes", headers={"content-type": "text/plain"})

    assert response.status_code == 200
    assert response.json()["content_type"] == "text/plain"
