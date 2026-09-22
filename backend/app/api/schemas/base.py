from pydantic import BaseModel, ConfigDict


class ApiModel(BaseModel):
    """Base for request/response models: unknown fields in requests are rejected."""

    model_config = ConfigDict(extra="forbid", from_attributes=True)
