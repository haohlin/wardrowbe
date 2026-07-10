from datetime import date
from uuid import uuid4

import pytest
import pytest_asyncio

from app.models.item import ClothingItem, ItemStatus
from app.models.outfit import Outfit, OutfitItem, OutfitSource, OutfitStatus
from app.models.user import User
from app.services.studio_service import StudioService


@pytest_asyncio.fixture
async def ai_lookbook_user(db_session):
    uid = uuid4()
    user = User(
        id=uid,
        external_id=f"ai-lookbook-{uid}",
        email=f"ai-lookbook-{uid}@example.com",
        display_name="AI Lookbook Tester",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def ai_lookbook_items(db_session, ai_lookbook_user):
    items = []
    for item_type in ["shirt", "pants"]:
        item = ClothingItem(
            id=uuid4(),
            user_id=ai_lookbook_user.id,
            type=item_type,
            image_path=f"test/{item_type}.jpg",
            status=ItemStatus.ready,
            primary_color="green" if item_type == "shirt" else "black",
            wear_count=0,
            wears_since_wash=0,
            needs_wash=False,
        )
        db_session.add(item)
        items.append(item)
    await db_session.commit()
    for item in items:
        await db_session.refresh(item)
    return items


@pytest.mark.asyncio
async def test_clone_to_lookbook_preserves_full_ai_suggestion_content(db_session, ai_lookbook_user, ai_lookbook_items):
    service = StudioService(db_session)
    shirt, pants = ai_lookbook_items[0], ai_lookbook_items[1]
    original = Outfit(
        user_id=ai_lookbook_user.id,
        occasion="date",
        scheduled_for=date.today(),
        source=OutfitSource.on_demand,
        status=OutfitStatus.pending,
        reasoning="Minimal Morning Ease",
        style_notes="Leave the top two buttons open for a relaxed daytime feel.",
        weather_data={"temperature": 22, "condition": "clear"},
        ai_raw_response={
            "highlights": [
                "Soft green with black creates a calm minimalist palette.",
                "The button-down gives the outfit structure.",
            ],
            "try_on_image_path": "user/outfit_tryons/minimal_morning.png",
            "localized_text": {
                "en": {
                    "headline": "Minimal Morning Ease",
                    "highlights": ["English highlight"],
                    "styling_tip": "English tip",
                },
                "zh": {
                    "headline": "极简晨间轻松感",
                    "highlights": ["中文亮点"],
                    "styling_tip": "中文提示",
                },
            },
        },
    )
    db_session.add(original)
    await db_session.flush()
    db_session.add_all([
        OutfitItem(outfit_id=original.id, item_id=shirt.id, position=0, layer_type="base"),
        OutfitItem(outfit_id=original.id, item_id=pants.id, position=1, layer_type="bottom"),
    ])
    await db_session.commit()

    clone = await service.clone_to_lookbook(
        user=ai_lookbook_user,
        source_outfit_id=original.id,
        name="Saved AI look",
    )
    await db_session.commit()

    assert clone.scheduled_for is None
    assert clone.name == "Saved AI look"
    assert clone.reasoning == original.reasoning
    assert clone.style_notes == original.style_notes
    assert clone.weather_data == original.weather_data
    assert clone.ai_raw_response == original.ai_raw_response
    assert clone.ai_raw_response["try_on_image_path"] == "user/outfit_tryons/minimal_morning.png"
    assert clone.ai_raw_response["localized_text"]["zh"]["headline"] == "极简晨间轻松感"
