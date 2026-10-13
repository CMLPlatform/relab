"""Route tests for the device-side pairing registration."""

from typing import TYPE_CHECKING

import pytest
from fastapi import status

if TYPE_CHECKING:
    from httpx import AsyncClient
    from redis.asyncio import Redis

pytestmark = pytest.mark.api

REGISTER_URL = "/v1/plugins/r9cam/pairing/register"
PAIRING_CODE = "ABCD23"
# The P-256 base point: a valid curve point in 43-char base64url.
PUBLIC_JWK = {
    "kty": "EC",
    "crv": "P-256",
    "x": "axfR8uEsQkf4vOblY6RA8ncDfYEt6zOg9KE5RdiYwpY",
    "y": "T-NC4v4af5uO5-tKfA-eFivOM1drMV7Oy7ZAaDe_UfU",
    "kid": "key-12345",
}


def _register_body(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "code": PAIRING_CODE,
        "rpi_fingerprint": "fingerprint",
        "public_key_jwk": PUBLIC_JWK,
        "key_id": "key-12345",
    }
    body.update(overrides)
    return body


async def test_register_accepts_a_valid_payload(api_client: AsyncClient, redis_client: Redis) -> None:
    """A well-formed registration is stored and acknowledged."""
    response = await api_client.post(REGISTER_URL, json=_register_body())

    assert response.status_code == status.HTTP_201_CREATED
    assert await redis_client.get(f"r9cam:pairing:{PAIRING_CODE}") is not None


@pytest.mark.parametrize(
    "overrides",
    [
        # Outside the poll-side charset: storing it would fail every later poll.
        pytest.param({"rpi_fingerprint": "bad fingerprint!"}, id="fingerprint-charset"),
        pytest.param({"rpi_fingerprint": "fïngerprint"}, id="fingerprint-non-ascii"),
        pytest.param({"public_key_jwk": {**PUBLIC_JWK, "x": "x"}}, id="jwk-coordinate-too-short"),
        pytest.param({"public_key_jwk": {**PUBLIC_JWK, "kid": "k" * 65}}, id="jwk-kid-too-long"),
        pytest.param({"public_key_jwk": {**PUBLIC_JWK, "d": "secret"}}, id="jwk-unknown-member"),
        pytest.param({"extra": "field"}, id="unknown-field"),
    ],
)
async def test_register_rejects_invalid_payload(
    api_client: AsyncClient, redis_client: Redis, overrides: dict[str, object]
) -> None:
    """Invalid registrations fail with 422 and leave nothing in Redis."""
    response = await api_client.post(REGISTER_URL, json=_register_body(**overrides))

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert await redis_client.get(f"r9cam:pairing:{PAIRING_CODE}") is None
