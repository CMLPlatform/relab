"""Shared fields for DTO schemas."""

from typing import Annotated

from pydantic import HttpUrl, PlainSerializer
from pydantic.networks import UrlConstraints

# HTTP URL that is stored as string in the database.
type HttpUrlToDB = Annotated[HttpUrl, PlainSerializer(str, return_type=str), UrlConstraints(max_length=250)]
