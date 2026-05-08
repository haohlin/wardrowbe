import pytest

from app.models.item import ItemStatus
from app.services.ai_service import ClothingTags
from app.workers.tagging import tags_to_item_fields


class TestTagsToItemFields:
    def test_ai_analysis_populates_edit_form_fields(self):
        tags = ClothingTags(
            type="sweater",
            subtype="crewneck",
            primary_color="navy",
            colors=["navy", "cream"],
            pattern="striped",
            material="knit",
            style=["casual", "classic"],
            formality="casual",
            season=["fall", "winter"],
            brand="Tommy Jeans",
            description="A navy and cream striped Tommy Jeans crewneck sweater.",
            confidence=0.95,
            raw_response='{"type":"sweater"}',
        )

        fields = tags_to_item_fields(tags, tags.raw_response)

        assert fields["type"] == "sweater"
        assert fields["subtype"] == "crewneck"
        assert fields["primary_color"] == "navy"
        assert fields["brand"] == "Tommy Jeans"
        assert fields["name"] == "Tommy Jeans striped crewneck sweater"
        assert fields["notes"] == "A navy and cream striped Tommy Jeans crewneck sweater."
        assert fields["ai_description"] == "A navy and cream striped Tommy Jeans crewneck sweater."
        assert fields["status"] == ItemStatus.ready
        assert fields["ai_processed"] is True

    @pytest.mark.asyncio
    async def test_tag_item_image_refreshes_existing_edit_form_fields(self, monkeypatch):
        from uuid import uuid4

        import app.workers.tagging as tagging
        from app.models.item import ClothingItem
        from app.workers.tagging import tag_item_image

        item = ClothingItem(
            id=uuid4(),
            user_id=uuid4(),
            image_path="x.jpg",
            type="unknown",
            name="Old Name",
            brand="Old Brand",
            primary_color="black",
            notes="Old notes",
            status=ItemStatus.processing,
        )

        class FakeResult:
            def __init__(self, value):
                self.value = value
            def scalar_one_or_none(self):
                return self.value

        class FakeDB:
            def __init__(self):
                self.commits = 0
                self.results = [item, None, item]
            async def execute(self, *_args, **_kwargs):
                return FakeResult(self.results.pop(0))
            async def commit(self):
                self.commits += 1
            async def close(self):
                pass

        class FakeAIService:
            def __init__(self, *args, **kwargs):
                pass
            async def analyze_image(self, _path):
                return ClothingTags(
                    ai_name="Beige Chino Pants",
                    type="pants",
                    subtype="chinos",
                    brand=None,
                    primary_color="beige",
                    colors=["beige"],
                    pattern="solid",
                    description="Fresh AI notes.",
                    confidence=0.9,
                )

        fake_db = FakeDB()
        image = __import__("pathlib").Path(__file__)
        monkeypatch.setattr(tagging, "get_db_session", lambda _ctx: fake_db)
        monkeypatch.setattr(tagging, "AIService", FakeAIService)

        result = await tag_item_image({}, str(item.id), str(image))

        assert result["status"] == "success"
        assert item.name == "Beige Chino Pants"
        assert item.type == "pants"
        assert item.subtype == "chinos"
        assert item.brand is None
        assert item.primary_color == "beige"
        assert item.notes == "Fresh AI notes."
        assert item.status == ItemStatus.ready
