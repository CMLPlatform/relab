"""Shared constants for backend interaction with the device-side RPi camera plugin."""

from enum import StrEnum

PLUGIN_STREAM_ENDPOINT = "/streams/youtube"

# The relay endpoint, relative to the API version prefix. Paired cameras persist the
# absolute URL handed to them at pairing, so changing this strands every camera in the
# field until it re-pairs. Both the route and the URL advertised by pairing derive from
# here so the two can never disagree.
RELAY_WS_PATH = "/plugins/rpi-cam/ws/connect"


class HttpMethod(StrEnum):
    """HTTP method type used by camera interaction helpers."""

    GET = "GET"
    OPTIONS = "OPTIONS"
    HEAD = "HEAD"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"
