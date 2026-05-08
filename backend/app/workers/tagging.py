import logging
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.models.item import ClothingItem, ItemStatus
from app.services.ai_service import AIService, ClothingTags
from app.workers.db import get_db_session

logger = logging.getLogger(__name__)


def _compact_label(parts: list[str | None]) -> str | None:
    """Join non-empty label parts without duplicating adjacent words."""
    cleaned: list[str] = []
    seen: set[str] = set()
    for part in parts:
        value = (part or "").strip()
        if not value:
            continue
        key = value.lower()
        if key in seen:
            continue
        cleaned.append(value)
        seen.add(key)
    return " ".join(cleaned) or None


def _suggest_item_name(tags: ClothingTags) -> str | None:
    """Build a concise editable item name from AI tags."""
    if tags.ai_name:
        return tags.ai_name.strip()
    garment = _compact_label([tags.subtype, tags.type if tags.type != "unknown" else None])
    if not garment:
        return None
    return _compact_label([tags.brand, tags.pattern, garment])


def tags_to_item_fields(tags: ClothingTags, raw_response: str | None = None) -> dict[str, Any]:
    """Convert ClothingTags to item database fields."""
    # Build the tags JSONB object for frontend display
    tags_jsonb = {
        "colors": tags.colors or [],
        "pattern": tags.pattern,
        "material": tags.material,
        "style": tags.style or [],
        "season": tags.season or [],
        "formality": tags.formality,
        "fit": tags.fit,
        "occasion": tags.occasion or [],
        "brand": tags.brand,
        "condition": tags.condition,
        "features": tags.features or [],
    }
    if tags.logprobs_confidence is not None:
        tags_jsonb["logprobs_confidence"] = tags.logprobs_confidence

    fields = {
        "type": tags.type,
        "subtype": tags.subtype,
        "name": _suggest_item_name(tags),
        "brand": tags.brand,
        "notes": tags.description,
        "primary_color": tags.primary_color,
        "colors": tags.colors,
        "pattern": tags.pattern,
        "material": tags.material,
        "style": tags.style,
        "formality": tags.formality,
        "season": tags.season,
        "tags": tags_jsonb,  # Populate the tags JSONB field for frontend
        "ai_processed": True,
        "ai_confidence": tags.confidence,
        "ai_description": tags.description,  # Human-readable description
        "status": ItemStatus.ready,
    }
    if raw_response:
        fields["ai_raw_response"] = {"raw_text": raw_response}
    return fields


async def update_item_status_to_error(ctx: dict, item_id: str, error_msg: str) -> None:
    """Update item status to error in database."""
    try:
        db = get_db_session(ctx)
        try:
            result = await db.execute(select(ClothingItem).where(ClothingItem.id == UUID(item_id)))
            item = result.scalar_one_or_none()
            if item:
                item.status = ItemStatus.error
                item.ai_raw_response = {"error": error_msg}
                await db.commit()
        finally:
            await db.close()
    except Exception as e:
        logger.error(f"Failed to update item {item_id} status to error: {e}")


async def tag_item_image(ctx: dict, item_id: str, image_path: str) -> dict[str, Any]:
    """
    Analyze an item's image and update it with AI-generated tags.

    Args:
        ctx: arq context
        item_id: UUID of the item to tag
        image_path: Path to the image file

    Returns:
        Dict with status and tags
    """
    logger.info(f"Starting AI tagging for item {item_id}")

    try:
        # Verify image exists
        path = Path(image_path)
        if not path.exists():
            error_msg = f"Image not found: {image_path}"
            logger.error(error_msg)
            await update_item_status_to_error(ctx, item_id, error_msg)
            return {"status": "error", "error": "Image not found"}

        # Get user's AI endpoints from preferences
        ai_endpoints = None
        db = get_db_session(ctx)
        try:
            # Get the item to find user_id
            result = await db.execute(select(ClothingItem).where(ClothingItem.id == UUID(item_id)))
            item = result.scalar_one_or_none()
            if item:
                # Get user's preferences for AI endpoints
                from app.models.preference import UserPreference

                pref_result = await db.execute(
                    select(UserPreference).where(UserPreference.user_id == item.user_id)
                )
                prefs = pref_result.scalar_one_or_none()
                if prefs and prefs.ai_endpoints:
                    ai_endpoints = prefs.ai_endpoints
                    logger.info(
                        f"Using {len(ai_endpoints)} custom AI endpoints for user {item.user_id}"
                    )
        finally:
            await db.close()

        # Analyze with AI (uses custom endpoints if available)
        ai_service = AIService(endpoints=ai_endpoints)
        tags = await ai_service.analyze_image(path)

        logger.info(
            f"AI analysis complete for item {item_id}: type={tags.type}, color={tags.primary_color}"
        )

        # Update item in database
        db = get_db_session(ctx)
        try:
            result = await db.execute(select(ClothingItem).where(ClothingItem.id == UUID(item_id)))
            item = result.scalar_one_or_none()

            if item is None:
                logger.error(f"Item not found: {item_id}")
                return {"status": "error", "error": "Item not found"}

            # Update item fields - only update if user hasn't already set a value
            # Always update: ai_processed, ai_confidence, status, ai_raw_response
            # Conditionally update: type, subtype, primary_color, colors, pattern, material, style, formality, season
            ai_fields = tags_to_item_fields(tags, tags.raw_response)

            for field, value in ai_fields.items():
                # Always update AI/system fields and AI-derived edit fields during
                # explicit analysis/re-analysis. This matches the button label:
                # running AI Analyze should refresh name/type/brand/color/notes
                # from the image, not leave stale user/default values behind.
                if field in (
                    "ai_processed",
                    "ai_confidence",
                    "status",
                    "ai_raw_response",
                    "tags",
                    "ai_description",
                    "name",
                    "type",
                    "subtype",
                    "brand",
                    "primary_color",
                    "notes",
                    "colors",
                    "pattern",
                    "material",
                    "style",
                    "formality",
                    "season",
                ):
                    setattr(item, field, value)

            await db.commit()
            logger.info(f"Updated item {item_id} with AI tags (status=ready)")

            return {
                "status": "success",
                "item_id": item_id,
                "tags": tags.model_dump(exclude={"raw_response"}),
            }

        finally:
            await db.close()

    except Exception as e:
        error_msg = str(e)
        logger.exception(f"Error tagging item {item_id}: {error_msg}")
        await update_item_status_to_error(ctx, item_id, error_msg)
        return {"status": "error", "error": error_msg}
