from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, computed_field

from app.utils.signed_urls import sign_image_url


class TryOnResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    outfit_id: UUID
    status: str
    person_image_path: str
    comparison_image_path: str | None = None
    result_image_path: str | None = None
    model: str | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None

    @computed_field
    @property
    def person_image_url(self) -> str:
        return sign_image_url(self.comparison_image_path or self.person_image_path)

    @computed_field
    @property
    def source_image_url(self) -> str:
        return self.person_image_url

    @computed_field
    @property
    def original_person_image_url(self) -> str:
        return sign_image_url(self.person_image_path)

    @computed_field
    @property
    def result_image_url(self) -> str | None:
        return sign_image_url(self.result_image_path) if self.result_image_path else None

    @computed_field
    @property
    def image_url(self) -> str | None:
        return self.result_image_url

    @computed_field
    @property
    def generated_image_url(self) -> str | None:
        return self.result_image_url


class TryOnListResponse(BaseModel):
    items: list[TryOnResponse]
    tryons: list[TryOnResponse]
    results: list[TryOnResponse]
    data: list[TryOnResponse]
    sessions: list[TryOnResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class TryOnQuotaResponse(BaseModel):
    used: int
    limit: int
    remaining: int
    bonus_credits: int = 0
    unlimited: bool = True
    can_generate: bool = True

    @computed_field
    @property
    def remaining_generations(self) -> int:
        return self.remaining

    @computed_field
    @property
    def used_generations(self) -> int:
        return self.used
