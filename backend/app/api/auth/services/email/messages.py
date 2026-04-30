"""Internal email message value objects."""

from dataclasses import dataclass, field

from pydantic import NameEmail


@dataclass(frozen=True, slots=True)
class EmailMessage:
    """Rendered email ready for provider delivery."""

    subject: str
    recipients: list[NameEmail]
    sender: NameEmail | None
    reply_to: list[NameEmail] = field(default_factory=list)
    html_body: str = ""
