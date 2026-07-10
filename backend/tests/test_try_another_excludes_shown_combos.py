from datetime import UTC, datetime
from uuid import uuid4
from unittest.mock import AsyncMock, patch

import pytest

from app.models.item import ClothingItem, ItemStatus
from app.models.outfit import Outfit, OutfitItem, OutfitSource, OutfitStatus
from app.services.recommendation_service import AIRecommendationError, RecommendationService
from app.services.weather_service import WeatherData
from tests.test_recommendation_service import _make_user


def _weather(temp: float = 22, condition: str = "clear") -> WeatherData:
    return WeatherData(
        temperature=temp,
        feels_like=temp,
        humidity=50,
        precipitation_chance=0,
        precipitation_mm=0,
        wind_speed=0,
        condition=condition,
        condition_code=0,
        is_day=True,
        uv_index=0,
        timestamp=datetime.now(UTC),
    )


async def _add_item(db_session, user, item_type: str, color: str) -> ClothingItem:
    item = ClothingItem(
        user_id=user.id,
        type=item_type,
        image_path=f"test/{uuid4()}.jpg",
        status=ItemStatus.ready,
        primary_color=color,
    )
    db_session.add(item)
    await db_session.flush()
    return item


async def _add_outfit(db_session, user, item_ids, *, occasion="casual") -> Outfit:
    outfit = Outfit(
        user_id=user.id,
        occasion=occasion,
        status=OutfitStatus.accepted,
        source=OutfitSource.on_demand,
        weather_data={"temperature": 22, "condition": "clear"},
    )
    db_session.add(outfit)
    await db_session.flush()
    for position, item_id in enumerate(item_ids):
        db_session.add(OutfitItem(outfit_id=outfit.id, item_id=item_id, position=position))
    await db_session.flush()
    return outfit


@pytest.mark.asyncio
async def test_auto_suggest_excludes_already_shown_existing_combos(db_session):
    user = _make_user()
    db_session.add(user)
    await db_session.flush()

    shirt = await _add_item(db_session, user, "shirt", "navy")
    pants = await _add_item(db_session, user, "pants", "beige")
    tee = await _add_item(db_session, user, "t-shirt", "white")
    jeans = await _add_item(db_session, user, "jeans", "blue")
    shown = await _add_outfit(db_session, user, [shirt.id, pants.id])
    fresh = await _add_outfit(db_session, user, [tee.id, jeans.id])
    await db_session.flush()

    service = RecommendationService(db_session)
    result = await service.auto_suggest_outfits(
        user=user,
        occasion="casual",
        weather_override=_weather(),
        time_of_day="afternoon",
        excluded_combinations=[[shirt.id, pants.id]],
    )

    assert result["mode"] == "existing"
    assert shown.id not in [outfit.id for outfit in result["outfits"]]
    assert [outfit.id for outfit in result["outfits"]] == [fresh.id]


@pytest.mark.asyncio
async def test_auto_suggest_generates_with_prompt_excluding_shown_combos_when_pool_exhausted(db_session):
    user = _make_user()
    db_session.add(user)
    await db_session.flush()

    shirt = await _add_item(db_session, user, "shirt", "navy")
    pants = await _add_item(db_session, user, "pants", "beige")
    shown = await _add_outfit(db_session, user, [shirt.id, pants.id])
    generated = Outfit(user_id=user.id, occasion="casual", status=OutfitStatus.pending, source=OutfitSource.on_demand)
    generated.items = []
    generated.feedback = None
    generated.family_ratings = []
    await db_session.flush()

    service = RecommendationService(db_session)
    with patch.object(service, "generate_recommendation", new_callable=AsyncMock, return_value=generated) as mock_generate:
        result = await service.auto_suggest_outfits(
            user=user,
            occasion="casual",
            weather_override=_weather(),
            time_of_day="afternoon",
            excluded_combinations=[[shirt.id, pants.id]],
        )

    assert result["mode"] == "generated"
    assert result["outfits"] == [generated]
    mock_generate.assert_awaited_once()
    assert mock_generate.await_args.kwargs["excluded_combinations"] == [[shirt.id, pants.id]]
    assert shown.id not in [outfit.id for outfit in result["outfits"]]


@pytest.mark.asyncio
async def test_generation_rejects_ai_combo_that_repeats_excluded_combo(db_session):
    user = _make_user()
    db_session.add(user)
    await db_session.flush()

    shirt = await _add_item(db_session, user, "shirt", "navy")
    pants = await _add_item(db_session, user, "pants", "beige")
    await db_session.flush()

    user.preferences = None
    service = RecommendationService(db_session)
    repeated_combo_response = '{"outfits":[{"items":[1,2],"headline":"Repeat","highlights":["same"],"styling_tip":"same","localized_text":{"en":{"headline":"Repeat","highlights":["same"],"styling_tip":"same"},"zh":{"headline":"重复","highlights":["相同"],"styling_tip":"相同"}}}]}'
    with patch("app.services.recommendation_service.AIService") as mock_ai_service:
        mock_ai = mock_ai_service.return_value
        mock_ai.generate_text = AsyncMock(
            return_value=type("Result", (), {"content": repeated_combo_response, "model": "test-model", "endpoint": "test-endpoint"})()
        )
        with pytest.raises(AIRecommendationError) as exc_info:
            await service.generate_recommendation(
                user=user,
                occasion="casual",
                weather_override=_weather(),
                time_of_day="afternoon",
                excluded_combinations=[[shirt.id, pants.id]],
            )

    assert "already shown" in str(exc_info.value)
    prompt = mock_ai.generate_text.await_args.args[0]
    assert "Do not repeat these already shown outfit combinations" in prompt
    assert "add more ready wardrobe items" in str(exc_info.value)
