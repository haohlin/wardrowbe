from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from app.models.item import ClothingItem, ItemStatus
from app.services.ai_service import AIService, ClothingTags
from app.services.background_removal import BackgroundRemovalProvider, HttpProvider
from app.services.image_service import ImageService
from app.services.recommendation_service import RecommendationService, InsufficientWardrobeError
from app.services.weather_service import WeatherData
from app.workers.tagging import tags_to_item_fields


class TestAIAnalysisFieldRegression:
    def test_parser_accepts_common_gpt_field_aliases_and_brand(self):
        service = AIService()
        response = """
        {
            "item_type": "shirt",
            "color": "navy",
            "brand": "Uniqlo",
            "name": "Uniqlo Navy Oxford Shirt",
            "notes": "A crisp navy oxford shirt."
        }
        """

        tags = service._parse_tags_from_response(response)

        assert tags.type == "shirt"
        assert tags.primary_color == "navy"
        assert tags.brand == "Uniqlo"
        assert tags.description == "A crisp navy oxford shirt."

    def test_tags_to_item_fields_prefers_ai_name_when_returned(self):
        tags = ClothingTags(
            type="shirt",
            primary_color="navy",
            brand="Uniqlo",
            description="A crisp navy oxford shirt.",
        )
        tags.ai_name = "Uniqlo Navy Oxford Shirt"

        fields = tags_to_item_fields(tags)

        assert fields["name"] == "Uniqlo Navy Oxford Shirt"
        assert fields["brand"] == "Uniqlo"
        assert fields["primary_color"] == "navy"
        assert fields["notes"] == "A crisp navy oxford shirt."


class FailingHttpProvider(HttpProvider):
    def __init__(self):
        pass

    def remove(self, image):
        raise RuntimeError("connection refused")


class TestRemoveBackgroundRegression:
    def test_image_service_falls_back_when_configured_http_provider_is_down(self, tmp_path, monkeypatch):
        from PIL import Image
        import app.services.background_removal as background_removal

        storage = tmp_path / "storage"
        user_dir = storage / "user"
        user_dir.mkdir(parents=True)
        image_path = "user/shirt.jpg"
        Image.new("RGB", (32, 32), (240, 240, 240)).save(storage / image_path)

        background_removal._provider = FailingHttpProvider()
        service = ImageService(storage_path=str(storage))

        result = service.remove_background(image_path, bg_color=(255, 255, 255))

        assert result["image_path"] == image_path
        assert (storage / image_path).exists()
        assert (storage / "user/shirt_medium.jpg").exists()
        assert (storage / "user/shirt_thumb.jpg").exists()


class TestRecommendationDiagnosticsRegression:
    @pytest.mark.asyncio
    async def test_insufficient_wardrobe_message_explains_threshold_and_counts(self):
        service = RecommendationService(AsyncMock())
        service.get_candidate_items = AsyncMock(return_value=[object()])
        service.get_candidate_item_diagnostics = AsyncMock(
            return_value={
                "minimum_required": 2,
                "ready": 3,
                "needs_wash": 1,
                "unknown_type": 1,
                "excluded_by_request": 0,
                "excluded_by_preferences": 0,
            }
        )
        service._get_today_rejected_item_ids = AsyncMock(return_value=set())

        class UserStub:
            id = uuid4()
            preferences = None
            timezone = "UTC"

        weather = WeatherData(
            temperature=20,
            feels_like=20,
            humidity=50,
            precipitation_chance=0,
            precipitation_mm=0,
            wind_speed=0,
            condition="clear",
            condition_code=0,
            is_day=True,
            uv_index=0,
            timestamp=None,
        )

        with pytest.raises(InsufficientWardrobeError) as exc:
            await service.generate_recommendation(
                user=UserStub(),
                occasion="casual",
                weather_override=weather,
            )
        msg = str(exc.value)
        assert "Need at least 2 usable items" in msg
        assert "1 usable" in msg
        assert "3 ready" in msg
        assert "1 unknown type" in msg
        assert "1 need washing" in msg

