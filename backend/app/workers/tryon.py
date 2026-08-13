import logging
from datetime import UTC, datetime
from uuid import UUID

from PIL import Image
from sqlalchemy import select

from app.models.item import ClothingItem
from app.models.outfit import OutfitItem
from app.models.tryon import TryOn, TryOnStatus
from app.services.face_alignment import detect_face_center
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
        result_path = storage.get_image_path(paths["image_path"])
        with Image.open(result_path) as result_image:
            result_size = result_image.size
        source_face_center = detect_face_center(person_path)
        result_face_center = detect_face_center(result_path)
        record.comparison_image_path = await storage.create_tryon_comparison_image(
            record.user_id,
            person_path.read_bytes(),
            person_path.name,
            result_size,
            source_face_center,
            result_face_center,
        )
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
