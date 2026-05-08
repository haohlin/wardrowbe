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
