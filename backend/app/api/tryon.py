import logging
from typing import Annotated
from uuid import UUID

from arq import create_pool
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile

from app.database import get_db
from app.models.outfit import Outfit
from app.models.tryon import TryOn, TryOnStatus
from app.models.user import User
from app.schemas.tryon import TryOnListResponse, TryOnQuotaResponse, TryOnResponse
from app.services.image_service import ImageService
from app.utils.auth import get_current_user
from app.workers.settings import get_redis_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tryon", tags=["Try-on"])


def _response(record: TryOn) -> TryOnResponse:
    return TryOnResponse.model_validate(record)


def _delete_image_variants(image_service: ImageService, path: str | None) -> None:
    if not path:
        return
    relative = path.rsplit(".", 1)[0]
    image_service.delete_images(
        {
            "original": path,
            "medium": f"{relative}_medium.jpg",
            "thumbnail": f"{relative}_thumb.jpg",
        }
    )


@router.get("/quota", response_model=TryOnQuotaResponse)
async def get_quota(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TryOnQuotaResponse:
    used = await db.scalar(select(func.count(TryOn.id)).where(TryOn.user_id == current_user.id))
    limit = 2_147_483_647
    return TryOnQuotaResponse(used=used or 0, limit=limit, remaining=limit - (used or 0))


@router.get("", response_model=TryOnListResponse)
async def list_tryons(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    outfit_id: UUID | None = None,
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
) -> TryOnListResponse:
    filters = [TryOn.user_id == current_user.id]
    if outfit_id:
        filters.append(TryOn.outfit_id == outfit_id)
    if status_filter:
        values = [value.strip() for value in status_filter.split(",") if value.strip()]
        valid = {value.value for value in TryOnStatus}
        if any(value not in valid for value in values):
            raise HTTPException(status_code=400, detail="Invalid try-on status")
        filters.append(TryOn.status.in_(values))

    total = await db.scalar(select(func.count(TryOn.id)).where(*filters)) or 0
    result = await db.execute(
        select(TryOn)
        .where(*filters)
        .order_by(TryOn.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    records = [_response(record) for record in result.scalars().all()]
    return TryOnListResponse(
        items=records,
        tryons=records,
        results=records,
        data=records,
        sessions=records,
        total=total,
        page=page,
        page_size=page_size,
        has_more=page * page_size < total,
    )


@router.get("/{tryon_id}", response_model=TryOnResponse)
async def get_tryon(
    tryon_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TryOnResponse:
    result = await db.execute(
        select(TryOn).where(TryOn.id == tryon_id, TryOn.user_id == current_user.id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Try-on not found")
    return _response(record)


@router.post("/outfit", response_model=TryOnResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_outfit_tryon(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TryOnResponse:
    form = await request.form()
    raw_outfit_id = form.get("outfit_id") or form.get("outfitId")
    try:
        outfit_id = UUID(str(raw_outfit_id))
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="outfit_id is required") from None

    use_saved_photo = str(form.get("use_saved_photo", "")).lower() == "true"
    upload = next((value for _, value in form.multi_items() if isinstance(value, UploadFile)), None)
    if upload is None and not use_saved_photo:
        raise HTTPException(status_code=422, detail="A person photo is required")

    outfit = await db.scalar(
        select(Outfit).where(Outfit.id == outfit_id, Outfit.user_id == current_user.id)
    )
    if outfit is None:
        raise HTTPException(status_code=404, detail="Outfit not found")

    image_service = ImageService()
    if use_saved_photo and upload is None:
        if not current_user.tryon_person_image_path:
            raise HTTPException(status_code=422, detail="No saved try-on photo")
        person_image_path = current_user.tryon_person_image_path
    else:
        content = await upload.read()
        content_type = upload.content_type or "application/octet-stream"
        if not image_service.validate_image(content, content_type, upload.filename):
            raise HTTPException(
                status_code=400,
                detail="Invalid image file. Supported formats: JPEG, PNG, WebP, HEIC",
            )
        try:
            paths = await image_service.process_and_store(
                current_user.id, content, upload.filename or "person.jpg"
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from None
        person_image_path = paths["image_path"]

    record = TryOn(
        user_id=current_user.id,
        outfit_id=outfit_id,
        person_image_path=person_image_path,
        status=TryOnStatus.pending,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    try:
        redis = await create_pool(get_redis_settings())
        try:
            job = await redis.enqueue_job(
                "generate_tryon", str(record.id), _queue_name="arq:tagging"
            )
            if job is None:
                raise RuntimeError("Try-on queue rejected the job")
            record.job_id = job.job_id
            await db.commit()
            await db.refresh(record)
        finally:
            await redis.aclose()
    except Exception as exc:
        record.status = TryOnStatus.failed
        record.error = "Unable to queue virtual try-on"
        await db.commit()
        logger.exception("Failed to queue try-on %s", record.id)
        raise HTTPException(status_code=503, detail=record.error) from exc

    return _response(record)


@router.delete("/{tryon_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tryon(
    tryon_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    record = await db.scalar(
        select(TryOn).where(TryOn.id == tryon_id, TryOn.user_id == current_user.id)
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Try-on not found")
    image_service = ImageService()
    if record.person_image_path != current_user.tryon_person_image_path:
        _delete_image_variants(image_service, record.person_image_path)
    _delete_image_variants(image_service, record.comparison_image_path)
    _delete_image_variants(image_service, record.result_image_path)
    await db.delete(record)
    await db.commit()
