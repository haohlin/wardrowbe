from datetime import datetime, UTC
from uuid import uuid4

from app.config import get_settings
from app.models.item import ClothingItem
from app.models.outfit import Outfit, OutfitItem, OutfitSource, OutfitStatus
from app.models.user import User
from app.services.recommendation_service import RecommendationService


def test_debug_prompt_is_only_exposed_when_debug_enabled(monkeypatch):
    from app.api.outfits import outfit_to_response

    item = ClothingItem(
        id=uuid4(),
        user_id=uuid4(),
        type="shirt",
        image_path="test/shirt.jpg",
        thumbnail_path="test/shirt-thumb.jpg",
        primary_color="blue",
    )
    outfit = Outfit(
        id=uuid4(),
        user_id=item.user_id,
        occasion="casual",
        status=OutfitStatus.pending,
        source=OutfitSource.on_demand,
        ai_raw_response={"_debug_prompt": "RAW PROMPT BODY", "highlights": ["ok"]},
        created_at=datetime.now(UTC),
    )
    outfit.items = [OutfitItem(item=item, position=0, layer_type="base")]
    outfit.feedback = None
    outfit.family_ratings = []

    monkeypatch.setattr(get_settings(), "debug", False)
    assert outfit_to_response(outfit).debug_prompt is None

    monkeypatch.setattr(get_settings(), "debug", True)
    assert outfit_to_response(outfit).debug_prompt == "RAW PROMPT BODY"


def test_preferences_prompt_includes_recent_generated_combinations():
    service = RecommendationService.__new__(RecommendationService)
    item1 = uuid4()
    item2 = uuid4()
    item3 = uuid4()
    text = service._format_preferences_for_prompt(
        None,
        None,
        None,
        {1: item1, 2: item2, 3: item3},
        occasion="office",
        recent_generated_combinations={frozenset({item1, item2})},
    )

    assert "Recently suggested outfits" in text
    assert "[1, 2]" in text
    assert "avoid repeating" in text
