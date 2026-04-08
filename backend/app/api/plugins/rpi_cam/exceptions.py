"""Custom exceptions for the Raspberry Pi camera plugin."""

from app.api.common.exceptions import (
    BadRequestError,
    ConflictError,
    FailedDependencyError,
    ForbiddenError,
    NotFoundError,
    ServiceUnavailableError,
)


class RecordingSessionStoreError(ServiceUnavailableError):
    """Raised when a YouTube recording session cannot be persisted."""

    def __init__(self) -> None:
        super().__init__(
            "Failed to store YouTube recording session in Redis.",
        )


class RecordingSessionNotFoundError(ConflictError):
    """Raised when no cached YouTube recording session exists for a camera."""

    def __init__(self) -> None:
        super().__init__("No cached YouTube recording session found for this camera.")


class InvalidRecordingSessionDataError(BadRequestError):
    """Raised when cached recording session data cannot be validated."""

    def __init__(self, details: str) -> None:
        super().__init__("Invalid recording session data.", details=details)


class GoogleOAuthAssociationRequiredError(ForbiddenError):
    """Raised when a user tries to use YouTube features without linking Google OAuth first."""

    def __init__(self) -> None:
        super().__init__(
            "Google OAuth account association required for YouTube streaming. "
            "Use /api/auth/oauth/google/associate/authorize."
        )


class InvalidCameraResponseError(FailedDependencyError):
    """Raised when the camera returns a payload that does not match the expected schema."""

    def __init__(self, details: str) -> None:
        super().__init__("Invalid response from camera.", details=details)


class NoActiveYouTubeRecordingError(ConflictError):
    """Raised when monitor/stop actions require an active YouTube recording."""

    def __init__(self) -> None:
        super().__init__("No active YouTube recording found for this camera.")


class CameraProxyRequestError(ServiceUnavailableError):
    """Raised when the backend cannot reach the camera over HTTP."""

    def __init__(self, endpoint: str, details: str) -> None:
        super().__init__(f"Network error contacting camera: {endpoint}", details=details)


class InvalidCameraOwnershipTransferError(BadRequestError):
    """Raised when a camera ownership transfer payload is invalid."""

    def __init__(self) -> None:
        super().__init__("owner_id must reference an existing user in the same organization.")


# ── Pairing exceptions ───────────────────────────────────────────────────────


class PairingCodeCollisionError(ConflictError):
    """Raised when a pairing code is already registered."""

    def __init__(self) -> None:
        super().__init__("Pairing code already in use. Generate a new one.")


class PairingCodeNotFoundError(NotFoundError):
    """Raised when a pairing code does not exist or has expired."""

    def __init__(self) -> None:
        super().__init__("Invalid or expired pairing code.")


class PairingCodeAlreadyClaimedError(ConflictError):
    """Raised when a pairing code has already been claimed by a user."""

    def __init__(self) -> None:
        super().__init__("This pairing code has already been claimed.")


class PairingFingerprintMismatchError(ForbiddenError):
    """Raised when the fingerprint does not match the registered pairing code."""

    def __init__(self) -> None:
        super().__init__("Fingerprint mismatch.")
