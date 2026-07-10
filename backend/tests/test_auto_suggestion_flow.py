from datetime import UTC, datetime
from uuid import uuid4
from unittest.mock import AsyncMock, patch

import pytest

from app.models.item import ClothingItem, ItemStatus
from app.models.outfit import Outfit, OutfitItem, OutfitSource, OutfitStatus
from app.services.recommendation_service import RecommendationService
from app.services.weather_service import WeatherData
from tests.test_recommendation_service import _make_user


def _weather(temp: float = 21, condition: str = "clear") -> WeatherData:
    return WeatherData(
        temperature=temp,
        feels_like=temp,
        humidity=50,
        precipitation_chance=10,
        precipitation_mm=0,
        wind_speed=0,
        condition=condition,
        condition_code=0,
        is_day=True,
        uv_index=0,
        timestamp=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_auto_suggestion_returns_all_suitable_existing_previews(db_session):
    user = _make_user()
    db_session.add(user)
    await db_session.flush()

    shirt = ClothingItem(user_id=user.id, type="shirt", image_path=f"test/{uuid4()}.jpg", status=ItemStatus.ready, primary_color="blue")
    pants = ClothingItem(user_id=user.id, type="pants", image_path=f"test/{uuid4()}.jpg", status=ItemStatus.ready, primary_color="black")
    db_session.add_all([shirt, pants])
    await db_session.flush()

    good_one = Outfit(
        user_id=user.id,
        occasion="casual",
        status=OutfitStatus.accepted,
        source=OutfitSource.manual,
        weather_data={"temperature": 20, "condition": "clear"},
        ai_raw_response={"try_on_image_path": "user/outfit_tryons/good_one.png"},
    )
    good_two = Outfit(
        user_id=user.id,
        occasion="weekend",
        status=OutfitStatus.pending,
        source=OutfitSource.on_demand,
        weather_data={"temperature": 22, "condition": "clear"},
        ai_raw_response={"try_on_image_path": "user/outfit_tryons/good_two.png"},
    )
    bad = Outfit(
        user_id=user.id,
        occasion="formal",
        status=OutfitStatus.pending,
        source=OutfitSource.manual,
        weather_data={"temperature": 2, "condition": "snow"},
    )
    db_session.add_all([good_one, good_two, bad])
    await db_session.flush()
    for outfit in [good_one, good_two, bad]:
        db_session.add_all([
            OutfitItem(outfit_id=outfit.id, item_id=shirt.id, position=0),
            OutfitItem(outfit_id=outfit.id, item_id=pants.id, position=1),
        ])
    await db_session.commit()

    service = RecommendationService(db_session)
    result = await service.auto_suggest_outfits(user=user, occasion="casual", weather_override=_weather(), time_of_day="afternoon")

    assert result["mode"] == "existing"
    assert [outfit.id for outfit in result["outfits"]] == [good_one.id, good_two.id]
    assert result["generated"] is False


@pytest.mark.asyncio
async def test_auto_suggestion_generates_new_when_no_existing_preview_fits(db_session):
    user = _make_user()
    db_session.add(user)
    await db_session.commit()

    generated = Outfit(user_id=user.id, occasion="casual", status=OutfitStatus.pending, source=OutfitSource.on_demand)
    generated.items = []
    generated.feedback = None
    generated.family_ratings = []

    service = RecommendationService(db_session)
    with patch.object(service, "generate_recommendation", new_callable=AsyncMock, return_value=generated) as mock_generate:
        result = await service.auto_suggest_outfits(user=user, occasion="casual", weather_override=_weather(), time_of_day="afternoon", language="zh")

    assert result["mode"] == "generated"
    assert result["outfits"] == [generated]
    mock_generate.assert_awaited_once()


@pytest.mark.asyncio
async def test_auto_suggestion_force_generate_bypasses_existing_pool(db_session):
    user = _make_user()
    db_session.add(user)
    await db_session.flush()

    shirt = ClothingItem(user_id=user.id, type="shirt", status=ItemStatus.ready, primary_color="navy", image_path="shirt.jpg")
    pants = ClothingItem(user_id=user.id, type="pants", status=ItemStatus.ready, primary_color="beige", image_path="pants.jpg")
    existing = Outfit(
        user_id=user.id,
        occasion="casual",
        status=OutfitStatus.accepted,
        source=OutfitSource.on_demand,
        weather_data={"temperature": 22, "condition": "clear"},
    )
    generated = Outfit(user_id=user.id, occasion="casual", status=OutfitStatus.pending, source=OutfitSource.on_demand)
    generated.items = []
    generated.feedback = None
    generated.family_ratings = []
    db_session.add_all([shirt, pants, existing])
    await db_session.flush()
    db_session.add_all([
        OutfitItem(outfit_id=existing.id, item_id=shirt.id, position=0),
        OutfitItem(outfit_id=existing.id, item_id=pants.id, position=1),
    ])
    await db_session.flush()

    service = RecommendationService(db_session)
    with patch.object(service, "generate_recommendation", new_callable=AsyncMock, return_value=generated) as mock_generate:
        result = await service.auto_suggest_outfits(
            user=user,
            occasion="casual",
            weather_override=_weather(),
            time_of_day="afternoon",
            force_generate=True,
            excluded_combinations=[[shirt.id, pants.id]],
        )

    assert result["mode"] == "generated"
    assert result["outfits"] == [generated]
    mock_generate.assert_awaited_once()
    assert mock_generate.await_args.kwargs["excluded_combinations"] == [[shirt.id, pants.id]]
