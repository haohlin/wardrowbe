import asyncio
import logging
from datetime import UTC, datetime
from pathlib import Path
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


def _store_comparison_image(
    storage: ImageService, user_id: UUID, person_path: Path, result_path: Path
) -> str:
    # Blocking (swift face detection, PIL resize): run it off the shared worker event loop.
    with Image.open(result_path) as result_image:
        result_size = result_image.size
    return storage.create_tryon_comparison_image(
        user_id,
        person_path,
        result_size,
        detect_face_center(person_path),
        detect_face_center(result_path),
    )


async def generate_tryon(ctx: dict, tryon_id: str) -> None:
    db = get_db_session(ctx)
    record: TryOn | None = None
    stored_paths: list[str] = []
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
            path
            for path in map(storage.get_image_path, item_result.scalars().all())
            if path.is_file()
        ]

        generated, model = await TryOnService().generate(person_path, garment_paths)
        paths = await storage.process_and_store(record.user_id, generated, f"tryon-{record.id}.png")
        stored_paths.append(paths["image_path"])
        comparison_image_path = await asyncio.to_thread(
            _store_comparison_image,
            storage,
            record.user_id,
            person_path,
            storage.get_image_path(paths["image_path"]),
        )
        stored_paths.append(comparison_image_path)
        record.comparison_image_path = comparison_image_path
        record.result_image_path = paths["image_path"]
        record.model = model
        record.status = TryOnStatus.completed
        record.completed_at = datetime.now(UTC)
        await db.commit()
        logger.info("Try-on %s completed with %s", record.id, model)
    except Exception as exc:
        logger.exception("Try-on %s failed", tryon_id)
        await db.rollback()
        # Nothing references these once the run fails (or the row was deleted mid-run).
        for path in stored_paths:
            storage.delete_image_variants(path)
        if record is None:
            result = await db.execute(select(TryOn).where(TryOn.id == UUID(tryon_id)))
            record = result.scalar_one_or_none()
        if record is not None:
            record.status = TryOnStatus.failed
            record.error = str(exc)[:2000]
            await db.commit()
    finally:
        await db.close()
