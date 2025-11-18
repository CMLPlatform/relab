"""Factories for email template context dicts for tests."""

from factory.base import DictFactory
from factory.faker import Faker


class EmailContextFactory(DictFactory):
    """Produce realistic email template context dicts for tests."""

    username = Faker("user_name")
    verification_link = Faker("url")
    reset_link = Faker("url")
    confirmation_link = Faker("url")
    unsubscribe_link = Faker("url")
    subject = Faker("sentence", nb_words=5)
    newsletter_content = Faker("text", max_nb_chars=200)


class EmailDataFactory(DictFactory):
    """Produce test data for email sending functions."""

    email = Faker("email")
    username = Faker("user_name")
    token = Faker("uuid4")
    subject = Faker("sentence", nb_words=5)
    body = Faker("text", max_nb_chars=200)
