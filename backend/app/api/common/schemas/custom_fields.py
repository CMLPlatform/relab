"""Shared fields for DTO schemas."""

from typing import Annotated

from pydantic import AnyUrl, HttpUrl, PlainSerializer, StringConstraints

# HTTP URL that is stored as string in the database.
type HttpUrlToDB = Annotated[HttpUrl, PlainSerializer(str, return_type=str), StringConstraints(max_length=250)]
type AnyUrlToDB = Annotated[AnyUrl, PlainSerializer(str, return_type=str), StringConstraints(max_length=250)]
