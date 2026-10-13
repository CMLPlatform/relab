"""Shared constants for backend interaction with the device-side RPi camera plugin."""

from enum import StrEnum

PLUGIN_STREAM_ENDPOINT = "/streams/youtube"

# Every plugin route lives under this path, relative to the API version prefix.
PLUGIN_PATH = "/plugins/r9cam"
# Cameras paired before the rename persist URLs under the old path, so the routes are also
# served there, outside the OpenAPI schema.
# TODO: drop /v1/plugins/rpi-cam/ after 2027-01-31
LEGACY_PLUGIN_PATH = "/plugins/rpi-cam"

# The relay endpoint, relative to PLUGIN_PATH. Paired cameras persist the absolute URL
# handed to them at pairing, so changing this strands every camera in the field until it
# re-pairs. Both the route and the URL advertised by pairing derive from here so the two
# can never disagree.
RELAY_WS_PATH = "/ws/connect"


class HttpMethod(StrEnum):
    """HTTP method type used by camera interaction helpers."""

    GET = "GET"
    OPTIONS = "OPTIONS"
    HEAD = "HEAD"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"
