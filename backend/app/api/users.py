from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile

from app.database import get_db
from app.models.item import ClothingItem, ItemStatus
from app.models.outfit import Outfit
from app.models.schedule import Schedule
from app.models.user import User
from app.services.image_service import ImageService
from app.services.user_service import UserService
from app.utils.auth import get_current_user
from app.utils.locale import SUPPORTED_LOCALES, is_supported_locale
from app.utils.signed_urls import sign_image_url

router = APIRouter(prefix="/users/me", tags=["Users"])


class OnboardingCompleteResponse(BaseModel):
    onboarding_completed: bool


class ActivationProgressResponse(BaseModel):
    items_ready: int
    total_outfits: int
    active_schedules: int


class UserProfileResponse(BaseModel):
    id: str
    email: str
    display_name: str
    avatar_url: str | None = None
    tryon_person_image_url: str | None = None
    timezone: str
    locale: str
    location_lat: float | None = None
    location_lon: float | None = None
    location_name: str | None = None
    family_id: str | None = None
    role: str
    onboarding_completed: bool
    body_measurements: dict | None = None
    gender: str | None = None


class UserProfileUpdate(BaseModel):
    display_name: str | None = None
    timezone: str | None = None
    locale: str | None = None
    location_lat: Decimal | None = None
    location_lon: Decimal | None = None
    location_name: str | None = None
    body_measurements: dict | None = None
    gender: Literal["female", "male", "non_binary", "prefer_not_to_say"] | None = None


@router.get("", response_model=UserProfileResponse)
async def get_profile(
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserProfileResponse:
    return _user_response(current_user)


@router.get("/activation", response_model=ActivationProgressResponse)
async def get_activation_progress(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ActivationProgressResponse:
    items_ready = await db.scalar(
        select(func.count())
        .select_from(ClothingItem)
        .where(
            ClothingItem.user_id == current_user.id,
            ClothingItem.status == ItemStatus.ready,
            ClothingItem.is_archived.is_(False),
        )
    )
    total_outfits = await db.scalar(
        select(func.count()).select_from(Outfit).where(Outfit.user_id == current_user.id)
    )
    active_schedules = await db.scalar(
        select(func.count())
        .select_from(Schedule)
        .where(Schedule.user_id == current_user.id, Schedule.enabled.is_(True))
    )
    return ActivationProgressResponse(
        items_ready=items_ready or 0,
        total_outfits=total_outfits or 0,
        active_schedules=active_schedules or 0,
    )


@router.patch("", response_model=UserProfileResponse)
async def update_profile(
    data: UserProfileUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserProfileResponse:
    update_data = data.model_dump(exclude_unset=True)

    # update_data is applied with a blanket setattr below, so an unsupported locale
    # must be rejected here to prevent it reaching the column.
    if "locale" in update_data and not is_supported_locale(update_data["locale"]):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"locale must be one of: {', '.join(SUPPORTED_LOCALES)}",
        )

    if "body_measurements" in update_data and update_data["body_measurements"] is not None:
        numeric_keys = {"chest", "waist", "hips", "inseam", "height", "weight"}
        for key, value in update_data["body_measurements"].items():
            if key in numeric_keys and isinstance(value, (int, float)) and value <= 0:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"{key} must be a positive number",
                )

    for field, value in update_data.items():
        setattr(current_user, field, value)

    await db.flush()
    await db.refresh(current_user)
    await db.commit()

    return _user_response(current_user)


@router.post("/tryon-photo", response_model=UserProfileResponse)
async def upload_tryon_photo(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserProfileResponse:
    form = await request.form()
    upload = form.get("photo")
    if not isinstance(upload, UploadFile):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A photo is required"
        )

    content = await upload.read()
    storage = ImageService()
    content_type = upload.content_type or "application/octet-stream"
    if not storage.validate_image(content, content_type, upload.filename):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid try-on photo")

    old_path = current_user.tryon_person_image_path
    try:
        paths = await storage.process_and_store(
            current_user.id, content, upload.filename or "tryon-person.jpg"
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    current_user.tryon_person_image_path = paths["image_path"]
    if old_path:
        _delete_image_variants(storage, old_path)
    await db.commit()
    await db.refresh(current_user)
    return _user_response(current_user)


@router.delete("/tryon-photo", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tryon_photo(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    storage = ImageService()
    _delete_image_variants(storage, current_user.tryon_person_image_path)
    current_user.tryon_person_image_path = None
    await db.commit()


def _delete_image_variants(storage: ImageService, path: str | None) -> None:
    if not path:
        return
    base = path.rsplit(".", 1)[0]
    storage.delete_images(
        {
            "original": path,
            "medium": f"{base}_medium.jpg",
            "thumbnail": f"{base}_thumb.jpg",
        }
    )


def _user_response(user: User) -> UserProfileResponse:
    return UserProfileResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        tryon_person_image_url=(
            sign_image_url(user.tryon_person_image_path) if user.tryon_person_image_path else None
        ),
        timezone=user.timezone,
        locale=user.locale,
        location_lat=float(user.location_lat) if user.location_lat else None,
        location_lon=float(user.location_lon) if user.location_lon else None,
        location_name=user.location_name,
        family_id=str(user.family_id) if user.family_id else None,
        role=user.role,
        onboarding_completed=user.onboarding_completed,
        body_measurements=user.body_measurements,
        gender=user.gender,
    )


@router.post("/onboarding/complete", response_model=OnboardingCompleteResponse)
async def complete_onboarding(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> OnboardingCompleteResponse:
    user_service = UserService(db)
    await user_service.complete_onboarding(current_user)
    await db.commit()

    return OnboardingCompleteResponse(onboarding_completed=True)
