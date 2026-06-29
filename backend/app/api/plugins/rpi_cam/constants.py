"""Shared constants for backend interaction with the device-side RPi camera plugin."""

from enum import StrEnum

PLUGIN_STREAM_ENDPOINT = "/streams/youtube"


class HttpMethod(StrEnum):
    """HTTP method type used by camera interaction helpers."""

    GET = "GET"
    OPTIONS = "OPTIONS"
    HEAD = "HEAD"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"
