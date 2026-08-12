import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select

from app.models.item import ClothingItem
from app.models.outfit import OutfitItem
from app.models.tryon import TryOn, TryOnStatus
from app.services.image_service import ImageService
from app.services.tryon_service import TryOnService
from app.workers.db import get_db_session

logger = logging.getLogger(__name__)


async def generate_tryon(ctx: dict, tryon_id: str) -> None:
    db = get_db_session(ctx)
    record: TryOn | None = None
    try:
        result = await db.execute(select(TryOn).where(TryOn.id == UUID(tryon_id)))
        record = result.scalar_one_or_none()
        if record is None or record.status not in {TryOnStatus.pending, TryOnStatus.processing}:
            return

        record.status = TryOnStatus.processing
        record.error = None
        await db.commit()

        storage = ImageService()
        person_path = storage.get_image_path(record.person_image_path)
        item_result = await db.execute(
            select(ClothingItem.image_path)
            .join(OutfitItem, OutfitItem.item_id == ClothingItem.id)
            .where(
                OutfitItem.outfit_id == record.outfit_id,
                ClothingItem.user_id == record.user_id,
                ClothingItem.is_archived.is_(False),
            )
            .order_by(OutfitItem.position)
        )
        garment_paths = [
            storage.get_image_path(path)
            for path in item_result.scalars().all()
            if storage.get_image_path(path).is_file()
        ]

        generated, model = await TryOnService().generate(person_path, garment_paths)
        paths = await storage.process_and_store(record.user_id, generated, f"tryon-{record.id}.png")
        record.result_image_path = paths["image_path"]
        record.model = model
        record.status = TryOnStatus.completed
        record.completed_at = datetime.now(UTC)
        await db.commit()
        logger.info("Try-on %s completed with %s", record.id, model)
    except Exception as exc:
        logger.exception("Try-on %s failed", tryon_id)
        await db.rollback()
        if record is None:
            result = await db.execute(select(TryOn).where(TryOn.id == UUID(tryon_id)))
            record = result.scalar_one_or_none()
        if record is not None:
            record.status = TryOnStatus.failed
            record.error = str(exc)[:2000]
            await db.commit()
    finally:
        await db.close()
