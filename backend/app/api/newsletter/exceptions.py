"""Custom exceptions for newsletter subscription flows."""

from app.api.common.exceptions import BadRequestError, NotFoundError


class NewsletterAlreadySubscribedError(BadRequestError):
    """Raised when a confirmed subscriber tries to subscribe again."""

    def __init__(self) -> None:
        super().__init__("Already subscribed.")


class NewsletterConfirmationResentError(BadRequestError):
    """Raised when a subscriber exists but still needs to confirm their email."""

    def __init__(self) -> None:
        super().__init__("Already subscribed, but not confirmed. A new confirmation email has been sent.")


class NewsletterInvalidConfirmationTokenError(BadRequestError):
    """Raised when a confirmation token is invalid or expired."""

    def __init__(self) -> None:
        super().__init__("Invalid or expired confirmation link.")


class NewsletterInvalidUnsubscribeTokenError(BadRequestError):
    """Raised when an unsubscribe token is invalid or expired."""

    def __init__(self) -> None:
        super().__init__("Invalid or expired unsubscribe link.")


class NewsletterSubscriberNotFoundError(NotFoundError):
    """Raised when the subscriber referenced by a token no longer exists."""

    def __init__(self) -> None:
        super().__init__("Subscriber not found.")


class NewsletterAlreadyConfirmedError(BadRequestError):
    """Raised when a subscription is already confirmed."""

    def __init__(self) -> None:
        super().__init__("Already confirmed.")
