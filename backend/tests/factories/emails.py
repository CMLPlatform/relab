"""Factories for email template context dicts for tests.

Using Polyfactory TypedDictFactory to replace legacy FactoryBoy DictFactory.
"""

from typing import TypedDict
from polyfactory.factories.typed_dict_factory import TypedDictFactory


class EmailContext(TypedDict):
    """Type definition for email context."""
    username: str
    verification_link: str
    reset_link: str
    confirmation_link: str
    unsubscribe_link: str
    subject: str
    newsletter_content: str


class EmailContextFactory(TypedDictFactory[EmailContext]):
    """Produce realistic email template context dicts for tests."""
    
    __model__ = EmailContext

    @classmethod
    def username(cls) -> str:
        return cls.__faker__.user_name()

    @classmethod
    def verification_link(cls) -> str:
        return cls.__faker__.url()

    @classmethod
    def reset_link(cls) -> str:
        return cls.__faker__.url()

    @classmethod
    def confirmation_link(cls) -> str:
        return cls.__faker__.url()

    @classmethod
    def unsubscribe_link(cls) -> str:
        return cls.__faker__.url()

    @classmethod
    def subject(cls) -> str:
        return cls.__faker__.sentence(nb_words=5)

    @classmethod
    def newsletter_content(cls) -> str:
        return cls.__faker__.text(max_nb_chars=200)


class EmailData(TypedDict):
    """Type definition for email data."""
    email: str
    username: str
    token: str
    subject: str
    body: str


class EmailDataFactory(TypedDictFactory[EmailData]):
    """Produce test data for email sending functions."""
    
    __model__ = EmailData

    @classmethod
    def email(cls) -> str:
        return cls.__faker__.email()

    @classmethod
    def username(cls) -> str:
        return cls.__faker__.user_name()

    @classmethod
    def token(cls) -> str:
        return str(cls.__faker__.uuid4())

    @classmethod
    def subject(cls) -> str:
        return cls.__faker__.sentence(nb_words=5)

    @classmethod
    def body(cls) -> str:
        return cls.__faker__.text(max_nb_chars=200)
