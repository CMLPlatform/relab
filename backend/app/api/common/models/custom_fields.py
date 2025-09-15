"""Custom Pydantic fields for database models."""

from typing import Annotated

from pydantic import AnyUrl, HttpUrl, PlainSerializer

# HTTP URL that is stored as string in the database.
HttpUrlInDB = Annotated[HttpUrl, PlainSerializer(lambda x: str(x), return_type=str)]
AnyUrlInDB = Annotated[AnyUrl, PlainSerializer(lambda x: str(x), return_type=str)]
