"""Backend-local streaming workflow schemas."""

from pydantic import BaseModel, Field, SecretStr


class YoutubeStreamConfig(BaseModel):
    """YouTube stream configuration sent to the Raspberry Pi plugin."""

    stream_key: SecretStr = Field(description="Stream key for YouTube streaming")
    broadcast_key: SecretStr = Field(description="Broadcast key for YouTube streaming")
