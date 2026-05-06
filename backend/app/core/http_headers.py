"""Shared HTTP header constants."""

NO_STORE = "no-store"
SENSITIVE_CACHE_CONTROL = "no-store, no-cache, must-revalidate"
SENSITIVE_CACHE_HEADERS = {
    "Cache-Control": SENSITIVE_CACHE_CONTROL,
    "Pragma": "no-cache",
    "Expires": "0",
}
REQUEST_ID_HEADER = "X-Request-ID"
