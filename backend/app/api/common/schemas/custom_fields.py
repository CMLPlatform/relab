"""Shared fields for DTO schemas."""

from typing import Annotated, TypeAlias

from pydantic import AnyUrl, HttpUrl, PlainSerializer, StringConstraints

# HTTP URL that is stored as string in the database.
HttpUrlToDB: TypeAlias = Annotated[HttpUrl, PlainSerializer(str, return_type=str), StringConstraints(max_length=250)]
AnyUrlToDB: TypeAlias = Annotated[AnyUrl, PlainSerializer(str, return_type=str), StringConstraints(max_length=250)]
