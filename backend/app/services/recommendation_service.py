import base64
import json
import logging
import mimetypes
import httpx
import re
from pathlib import Path
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.item import ClothingItem, ItemStatus
from app.models.learning import ItemPairScore, UserLearningProfile
from app.models.outfit import (
    FamilyOutfitRating,
    Outfit,
    OutfitItem,
    OutfitSource,
    OutfitStatus,
    UserFeedback,
)
from app.models.preference import UserPreference
from app.models.user import User
from app.config import get_settings
from app.services.ai_service import AIService
from app.services.item_scorer import get_season, score_items
from app.services.suggestion_cache import pop_suggestion, push_suggestions
from app.services.weather_service import WeatherData, WeatherService, WeatherServiceError
from app.utils.clothing import deduplicate_by_body_slot
from app.utils.prompts import load_prompt
from app.utils.timezone import get_user_today

logger = logging.getLogger(__name__)

SINGLE_OUTFIT_FORMAT = (
    "Respond with valid JSON:\n"
    '{{"items": [item numbers], "headline": "Short catchy outfit title (max 5 words)", '
    '"highlights": ["One short sentence each — vary your reasoning across color, texture, '
    'proportion, occasion, weather, or time of day"], '
    '"styling_tip": "One specific, actionable styling detail — do not suggest rolling up '
    'sleeves every time, vary your advice"}}'
)


def get_time_of_day(user: User) -> str:
    try:
        user_tz = ZoneInfo(user.timezone or "UTC")
    except Exception:
        user_tz = ZoneInfo("UTC")
    hour = datetime.now(UTC).astimezone(user_tz).hour
    if 6 <= hour < 12:
        return "morning"
    elif 12 <= hour < 17:
        return "afternoon"
    elif 17 <= hour < 21:
        return "evening"
    else:
        return "night"


@dataclass
class RecommendationContext:
    user: User
    preferences: UserPreference | None
    weather: WeatherData
    occasion: str
    exclude_items: list[UUID]
    include_items: list[UUID]


RECOMMENDATION_PROMPT = load_prompt("recommendation")


class RecommendationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.weather_service = WeatherService()

    async def get_candidate_items(
        self,
        user: User,
        weather: WeatherData,
        occasion: str,
        preferences: UserPreference | None,
        exclude_items: list[UUID],
    ) -> list[ClothingItem]:
        query = select(ClothingItem).where(
            and_(
                ClothingItem.user_id == user.id,
                ClothingItem.status == ItemStatus.ready,
                ClothingItem.is_archived.is_(False),
            )
        )

        result = await self.db.execute(query)
        items = list(result.scalars().all())

        if not items:
            return []

        items = [i for i in items if not i.needs_wash]
        items = [i for i in items if i.type and i.type != "unknown"]

        if exclude_items:
            exclude_set = set(exclude_items)
            items = [i for i in items if i.id not in exclude_set]

        if preferences and preferences.excluded_item_ids:
            excluded = set(preferences.excluded_item_ids)
            items = [i for i in items if i.id not in excluded]

        return items

    async def get_candidate_item_diagnostics(
        self,
        user: User,
        preferences: UserPreference | None,
        exclude_items: list[UUID],
    ) -> dict[str, int]:
        result = await self.db.execute(
            select(ClothingItem).where(
                and_(
                    ClothingItem.user_id == user.id,
                    ClothingItem.status == ItemStatus.ready,
                    ClothingItem.is_archived.is_(False),
                )
            )
        )
        ready_items = list(result.scalars().all())
        explicit_excluded = set(exclude_items or [])
        preference_excluded = set(preferences.excluded_item_ids or []) if preferences else set()

        return {
            "minimum_required": 2,
            "ready": len(ready_items),
            "needs_wash": sum(1 for item in ready_items if item.needs_wash),
            "unknown_type": sum(1 for item in ready_items if not item.type or item.type == "unknown"),
            "excluded_by_request": sum(1 for item in ready_items if item.id in explicit_excluded),
            "excluded_by_preferences": sum(1 for item in ready_items if item.id in preference_excluded),
        }

    def _insufficient_wardrobe_message(self, usable_count: int, diagnostics: dict[str, int]) -> str:
        reasons = []
        if diagnostics.get("unknown_type"):
            reasons.append(f"{diagnostics['unknown_type']} unknown type")
        if diagnostics.get("needs_wash"):
            reasons.append(f"{diagnostics['needs_wash']} need washing")
        if diagnostics.get("excluded_by_request"):
            reasons.append(f"{diagnostics['excluded_by_request']} excluded by current filters")
        if diagnostics.get("excluded_by_preferences"):
            reasons.append(f"{diagnostics['excluded_by_preferences']} excluded by preferences")

        reason_text = f" Blocked items: {', '.join(reasons)}." if reasons else ""
        return (
            f"Need at least {diagnostics.get('minimum_required', 2)} usable items to generate a suggestion; "
            f"found {usable_count} usable out of {diagnostics.get('ready', 0)} ready wardrobe items."
            f"{reason_text} Usable items must be ready, not archived, not marked as needing wash, "
            "have a known type, and not be excluded by filters/preferences."
        )

    async def _get_recently_worn_dates(self, user: User) -> dict[UUID, date]:
        result = await self.db.execute(
            select(ClothingItem.id, ClothingItem.last_worn_at).where(
                and_(
                    ClothingItem.user_id == user.id,
                    ClothingItem.last_worn_at.is_not(None),
                )
            )
        )
        return {row[0]: row[1] for row in result.all()}

    async def _get_today_rejected_item_ids(self, user: User, occasion: str) -> set[UUID]:
        user_today = get_user_today(user)
        result = await self.db.execute(
            select(OutfitItem.item_id)
            .join(Outfit, OutfitItem.outfit_id == Outfit.id)
            .where(
                and_(
                    Outfit.user_id == user.id,
                    Outfit.status == OutfitStatus.rejected,
                    Outfit.scheduled_for == user_today,
                    Outfit.occasion == occasion,
                )
            )
            .distinct()
        )
        return set(result.scalars().all())

    async def _get_recently_worn_outfit_combinations(
        self, user: User, days: int = 7
    ) -> set[frozenset[UUID]]:
        if days <= 0:
            return set()

        user_today = get_user_today(user)
        cutoff_date = user_today - timedelta(days=days)

        query = (
            select(Outfit)
            .join(UserFeedback, Outfit.id == UserFeedback.outfit_id)
            .where(
                and_(
                    Outfit.user_id == user.id,
                    UserFeedback.worn_at >= cutoff_date,
                )
            )
            .options(selectinload(Outfit.items))
        )

        result = await self.db.execute(query)
        worn_outfits = list(result.scalars().all())

        combinations = set()
        for outfit in worn_outfits:
            item_ids = frozenset(outfit_item.item_id for outfit_item in outfit.items)
            if len(item_ids) >= 2:
                combinations.add(item_ids)

        logger.info(f"Found {len(combinations)} worn outfit combinations in last {days} days")
        return combinations

    def _format_items_for_prompt(
        self,
        scored_items: list,
        good_pairs: dict[UUID, list[UUID]],
        user_today: date,
    ) -> tuple[str, dict[int, UUID]]:
        lines = []
        number_map: dict[int, UUID] = {}

        items_with_numbers: list[tuple[int, ClothingItem]] = []
        for i, si in enumerate(scored_items, 1):
            item = si.item if hasattr(si, "item") else si
            number_map[i] = item.id
            items_with_numbers.append((i, item))

        id_to_number = {item.id: num for num, item in items_with_numbers}

        for num, item in items_with_numbers:
            parts = []

            item_type = item.type or "item"
            if item.subtype:
                parts.append(f"{item.subtype} ({item_type})")
            else:
                parts.append(item_type)

            if item.colors and len(item.colors) > 1:
                parts.append(f"colors: {', '.join(item.colors)}")
            elif item.primary_color:
                parts.append(item.primary_color)

            if item.pattern and item.pattern != "solid":
                parts.append(item.pattern)

            item_size = getattr(item, "size", None)
            if item_size:
                parts.append(f"size {item_size}")

            if item.material:
                parts.append(item.material)

            if item.formality:
                parts.append(item.formality)

            if item.style:
                parts.append(f"style: {', '.join(item.style)}")

            if item.season:
                parts.append(f"season: {', '.join(item.season)}")

            fit = item.tags.get("fit") if item.tags else None
            if fit:
                parts.append(f"{fit} fit")

            if item.name:
                parts.insert(0, f'"{item.name}"')

            # Recency annotation
            if item.last_worn_at:
                days_ago = (user_today - item.last_worn_at).days
                if 0 <= days_ago <= 14:
                    parts.append(f"worn {days_ago} days ago")
            else:
                parts.append("never worn")

            # Pair annotation
            partners = good_pairs.get(item.id, [])
            if partners:
                pair_nums = sorted([id_to_number[p] for p in partners if p in id_to_number])[:3]
                if pair_nums:
                    refs = ", ".join(f"[{n}]" for n in pair_nums)
                    parts.append(f"pairs well with: {refs}")

            line = f"[{num}] {' | '.join(parts)}"
            lines.append(line)

        return "\n".join(lines), number_map

    def _format_preferences_for_prompt(
        self,
        preferences: UserPreference | None,
        learned_prefs: dict | None = None,
        worn_combinations: set[frozenset[UUID]] | None = None,
        number_map: dict[int, UUID] | None = None,
        occasion: str | None = None,
        body_measurements: dict | None = None,
        gender: str | None = None,
        user_request: str | None = None,
    ) -> str:
        lines = []

        if user_request and user_request.strip():
            lines.append(f"- CURRENT USER REQUEST: {user_request.strip()}")

        if gender:
            display_gender = gender.replace("_", " ")
            lines.append(f"- Gender identity for fit and styling context: {display_gender}")

        if body_measurements:
            m = body_measurements
            body_parts = []
            if m.get("height"):
                body_parts.append(f"height {m['height']}cm")
            if m.get("weight"):
                body_parts.append(f"weight {m['weight']}kg")
            if m.get("chest"):
                body_parts.append(f"chest {m['chest']}cm")
            if m.get("waist"):
                body_parts.append(f"waist {m['waist']}cm")
            if m.get("hips"):
                body_parts.append(f"hips {m['hips']}cm")
            if m.get("inseam"):
                body_parts.append(f"inseam {m['inseam']}cm")
            if m.get("shirt_size"):
                body_parts.append(f"shirt size {m['shirt_size']}")
            if m.get("pants_size"):
                body_parts.append(f"pants size {m['pants_size']}")
            if m.get("shoe_size"):
                body_parts.append(f"shoe size {m['shoe_size']}")
            if body_parts:
                lines.append(f"- Body: {', '.join(body_parts)}")

        if preferences:
            if preferences.color_favorites:
                lines.append(f"- Favorite colors: {', '.join(preferences.color_favorites)}")
            if preferences.color_avoid:
                lines.append(f"- Colors to avoid: {', '.join(preferences.color_avoid)}")
            if preferences.style_profile:
                profile = preferences.style_profile
                strong = sorted(
                    [(k, v) for k, v in profile.items() if isinstance(v, (int, float)) and v > 60],
                    key=lambda x: x[1],
                    reverse=True,
                )
                weak = [k for k, v in profile.items() if isinstance(v, (int, float)) and v < 30]
                if strong:
                    desc = ", ".join(f"{k} ({v}%)" for k, v in strong)
                    lines.append(f"- Preferred styles: {desc}")
                if weak:
                    lines.append(f"- Less preferred styles: {', '.join(weak)}")
            if preferences.variety_level:
                lines.append(f"- Variety preference: {preferences.variety_level}")
            if preferences.layering_preference and preferences.layering_preference != "moderate":
                lines.append(f"- Layering preference: {preferences.layering_preference}")
            if (
                preferences.temperature_sensitivity
                and preferences.temperature_sensitivity != "normal"
            ):
                lines.append(
                    f"- Temperature sensitivity: {preferences.temperature_sensitivity} "
                    f"(user {'feels cold/hot easily' if preferences.temperature_sensitivity == 'high' else 'tolerates temperature extremes well'})"
                )

        if learned_prefs:
            if learned_prefs.get("learned_favorite_colors"):
                colors = learned_prefs["learned_favorite_colors"]
                lines.append(f"- Learned favorite colors (from feedback): {', '.join(colors)}")
            if learned_prefs.get("learned_avoid_colors"):
                colors = learned_prefs["learned_avoid_colors"]
                lines.append(f"- Learned colors to avoid (from feedback): {', '.join(colors)}")
            if learned_prefs.get("learned_preferred_styles"):
                styles = learned_prefs["learned_preferred_styles"]
                lines.append(f"- Learned preferred styles: {', '.join(styles)}")

            if occasion and learned_prefs.get("occasion_insights"):
                occ_data = learned_prefs["occasion_insights"].get(occasion)
                if occ_data:
                    pref_colors = occ_data.get("preferred_colors", [])
                    if pref_colors:
                        lines.append(f"- For {occasion}, user prefers: {', '.join(pref_colors)}")
                    success_rate = occ_data.get("success_rate")
                    if success_rate is not None and success_rate < 0.5:
                        lines.append(
                            f"- Low success rate for {occasion} outfits — try different approaches"
                        )

        if worn_combinations and number_map:
            uuid_to_number = {uuid: num for num, uuid in number_map.items()}
            worn_sets = []
            for combo in worn_combinations:
                numbers = sorted([uuid_to_number[uuid] for uuid in combo if uuid in uuid_to_number])
                if numbers:
                    worn_sets.append("[" + ", ".join(map(str, numbers)) + "]")
            if worn_sets:
                lines.append(
                    f"- Recently worn outfits (prefer variety, only repeat if necessary): {', '.join(worn_sets)}"
                )

        if lines:
            return "\nUSER PREFERENCES:\n" + "\n".join(lines)
        return ""

    async def _get_learned_preferences(self, user_id: UUID, occasion: str | None = None) -> dict:
        result = await self.db.execute(
            select(UserLearningProfile).where(UserLearningProfile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()

        if not profile or not profile.last_computed_at:
            return {}

        preferences = {}

        if profile.learned_color_scores:
            liked_colors = sorted(
                [(c, s) for c, s in profile.learned_color_scores.items() if s > 0.2],
                key=lambda x: x[1],
                reverse=True,
            )[:5]
            disliked_colors = sorted(
                [(c, s) for c, s in profile.learned_color_scores.items() if s < -0.2],
                key=lambda x: x[1],
            )[:3]

            if liked_colors:
                preferences["learned_favorite_colors"] = [c for c, _ in liked_colors]
            if disliked_colors:
                preferences["learned_avoid_colors"] = [c for c, _ in disliked_colors]

        if profile.learned_style_scores:
            liked_styles = sorted(
                [(s, score) for s, score in profile.learned_style_scores.items() if score > 0.2],
                key=lambda x: x[1],
                reverse=True,
            )[:3]
            if liked_styles:
                preferences["learned_preferred_styles"] = [s for s, _ in liked_styles]

        if occasion and profile.learned_occasion_patterns:
            occ_data = profile.learned_occasion_patterns.get(occasion)
            if occ_data:
                preferences["occasion_insights"] = {occasion: occ_data}

        return preferences

    async def _get_good_item_pairs(self, user_id: UUID) -> dict[UUID, list[UUID]]:
        result = await self.db.execute(
            select(ItemPairScore)
            .where(
                and_(
                    ItemPairScore.user_id == user_id,
                    ItemPairScore.compatibility_score > 0.3,
                    ItemPairScore.times_paired >= 2,
                )
            )
            .order_by(ItemPairScore.compatibility_score.desc())
            .limit(50)
        )
        pairs = list(result.scalars().all())

        good_pairs: dict[UUID, list[UUID]] = {}
        for pair in pairs:
            if pair.item1_id not in good_pairs:
                good_pairs[pair.item1_id] = []
            good_pairs[pair.item1_id].append(pair.item2_id)

            if pair.item2_id not in good_pairs:
                good_pairs[pair.item2_id] = []
            good_pairs[pair.item2_id].append(pair.item1_id)

        return good_pairs

    def _language_instruction(self, language: str | None) -> str:
        if language == "zh":
            return (
                "\nLANGUAGE REQUIREMENT:\n"
                "- Write headline, highlights, and styling_tip in natural Simplified Chinese.\n"
                "- Keep JSON keys exactly in English.\n"
                "- Do not mix English into user-facing suggestion text unless it is a brand or item name.\n"
            )
        return (
            "\nLANGUAGE REQUIREMENT:\n"
            "- Write headline, highlights, and styling_tip in natural English.\n"
            "- Keep JSON keys exactly in English.\n"
        )

    def _body_measurements_summary(self, user: User) -> str:
        measurements = getattr(user, "body_measurements", None) or {}
        gender = getattr(user, "gender", None)
        parts = []
        if gender:
            parts.append(f"gender identity {gender.replace('_', ' ')}")
        if not measurements:
            return ", ".join(parts) if parts else "No saved body measurements; use an average adult model silhouette."

        units = {
            "height": "cm",
            "weight": "kg",
            "chest": "cm",
            "waist": "cm",
            "hips": "cm",
            "inseam": "cm",
        }
        for key in ["height", "weight", "chest", "waist", "hips", "inseam"]:
            if measurements.get(key):
                parts.append(f"{key} {measurements[key]}{units[key]}")
        for key in ["shirt_size", "pants_size", "shoe_size"]:
            if measurements.get(key):
                parts.append(f"{key.replace('_', ' ')} {measurements[key]}")
        return ", ".join(parts) if parts else "No saved body measurements; use an average adult model silhouette."

    def _build_try_on_prompt(
        self,
        user: User,
        items: list[ClothingItem],
        outfit_data: dict,
        occasion: str,
        language: str | None,
    ) -> str:
        item_lines = []
        for item in items:
            desc = ", ".join(
                part
                for part in [
                    item.name,
                    item.subtype or item.type,
                    item.primary_color,
                    item.material,
                    item.brand,
                ]
                if part
            )
            item_lines.append(f"- {desc or item.type}")
        language_name = "Chinese" if language == "zh" else "English"
        return (
            "Create one realistic fashion try-on image for this suggested outfit. "
            "Show the same anonymous adult model wearing all listed wardrobe items. "
            "The final picture must include TWO full-body views side by side: front and back views (front view and back view). "
            "Layer garments in a physically plausible order: shells, windbreakers, outdoor jackets, parkas, and coats are outermost; "
            "never place a jacket or shell underneath a cardigan, sweater, or long rope knit. "
            "Use a neutral studio background, realistic fabric, natural proportions, and preserve the garments' "
            "colors, textures, shapes, and visible details from the reference photos. Do not add extra clothing.\n\n"
            f"User body measurements for model proportions: {self._body_measurements_summary(user)}.\n"
            f"Occasion: {occasion}.\n"
            f"Outfit title: {outfit_data.get('headline') or outfit_data.get('reasoning') or 'Suggested outfit'}.\n"
            f"Items to combine:\n" + "\n".join(item_lines) + "\n\n"
            f"If any small labels/captions appear, use {language_name}; otherwise return only the image."
        )

    def _image_part_for_prompt(self, path: Path) -> dict:
        mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
        image_b64 = base64.b64encode(path.read_bytes()).decode("utf-8")
        return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}}

    def _extract_image_bytes(self, message: dict) -> bytes:
        images = message.get("images") or []
        if not images:
            raise RuntimeError(f"NVHub image model returned no image: {message}")
        url = images[0].get("image_url", {}).get("url") or images[0].get("url")
        if not url or not url.startswith("data:"):
            raise RuntimeError("NVHub image model returned an unsupported image payload")
        return base64.b64decode(url.split(",", 1)[1])

    async def _generate_try_on_image(
        self,
        user: User,
        outfit_data: dict,
        items: list[ClothingItem],
        occasion: str,
        language: str | None,
    ) -> str | None:
        settings = get_settings()
        if not settings.ai_api_key:
            logger.warning("Skipping try-on image: AI_API_KEY is not configured")
            return None

        storage = Path(settings.storage_path)
        references = []
        for item in items[:8]:
            rel = item.medium_path or item.image_path or item.thumbnail_path
            if not rel:
                continue
            full = storage / rel
            if full.exists():
                references.append((item, full))

        if not references:
            logger.warning("Skipping try-on image: no local item reference images found")
            return None

        content = [{"type": "text", "text": self._build_try_on_prompt(user, items, outfit_data, occasion, language)}]
        for index, (item, full) in enumerate(references, 1):
            content.append({"type": "text", "text": f"Reference garment {index}: {item.name or item.type}. Preserve this garment's visual design."})
            content.append(self._image_part_for_prompt(full))

        model = settings.bg_removal_model or "gcp/google/gemini-3-pro-image-preview"
        payload = {"model": model, "messages": [{"role": "user", "content": content}]}
        headers = {"Authorization": f"Bearer {settings.ai_api_key}", "Content-Type": "application/json"}

        async with httpx.AsyncClient(timeout=240, follow_redirects=True) as client:
            response = await client.post(
                f"{str(settings.ai_base_url).rstrip('/')}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()

        data = response.json()
        message = data["choices"][0]["message"]
        image_bytes = self._extract_image_bytes(message)

        out_dir = storage / str(user.id) / "outfit_tryons"
        out_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{datetime.now(UTC).strftime('%Y%m%d_%H%M%S')}_{outfit_data.get('headline', 'tryon')[:12].lower().replace(' ', '_')}.png"
        # keep filename conservative for filesystem/signed URL path usage
        filename = re.sub(r"[^a-z0-9_\-.]", "", filename) or "tryon.png"
        out_path = out_dir / filename
        out_path.write_bytes(image_bytes)
        return f"{user.id}/outfit_tryons/{filename}"

    def _parse_ai_response(self, content: str) -> dict:
        def strip_comments(json_str: str) -> str:
            json_str = re.sub(r"//[^\n]*", "", json_str)
            json_str = re.sub(r"/\*[\s\S]*?\*/", "", json_str)
            return json_str

        try:
            return json.loads(content.strip())
        except json.JSONDecodeError:
            pass

        try:
            return json.loads(strip_comments(content.strip()))
        except json.JSONDecodeError:
            pass

        json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", content)
        if json_match:
            extracted = json_match.group(1)
            try:
                return json.loads(extracted)
            except json.JSONDecodeError:
                pass
            try:
                return json.loads(strip_comments(extracted))
            except json.JSONDecodeError:
                pass

        start_idx = content.find("{")
        if start_idx != -1:
            brace_count = 0
            for i, char in enumerate(content[start_idx:], start_idx):
                if char == "{":
                    brace_count += 1
                elif char == "}":
                    brace_count -= 1
                    if brace_count == 0:
                        json_str = content[start_idx : i + 1]
                        try:
                            return json.loads(json_str)
                        except json.JSONDecodeError:
                            pass
                        try:
                            return json.loads(strip_comments(json_str))
                        except json.JSONDecodeError:
                            break

        start_idx = content.find("[")
        if start_idx != -1:
            bracket_count = 0
            for i, char in enumerate(content[start_idx:], start_idx):
                if char == "[":
                    bracket_count += 1
                elif char == "]":
                    bracket_count -= 1
                    if bracket_count == 0:
                        json_str = content[start_idx : i + 1]
                        try:
                            result = json.loads(json_str)
                            if isinstance(result, list) and len(result) > 0:
                                if isinstance(result[0], dict):
                                    return result[0]
                                return {"items": result}
                            return result
                        except json.JSONDecodeError:
                            break

        raise ValueError(f"Could not parse AI response as JSON: {content[:200]}")

    def _parse_multi_outfit_response(self, content: str) -> list[dict]:
        parsed = self._parse_ai_response(content)

        if isinstance(parsed, dict) and "outfits" in parsed:
            outfits = parsed["outfits"]
            if isinstance(outfits, list) and outfits:
                return outfits

        if isinstance(parsed, list) and parsed:
            return parsed

        if isinstance(parsed, dict) and "items" in parsed:
            return [parsed]

        return [parsed]

    async def _materialize_outfit(
        self,
        outfit_data: dict,
        user: User,
        weather: WeatherData,
        occasion: str,
        source: OutfitSource,
        number_map: dict[int, UUID],
        scheduled_date: date | None = None,
        language: str | None = "en",
    ) -> Outfit:
        selected_numbers = outfit_data.get("items", [])
        valid_ids = []

        for num in selected_numbers:
            try:
                num_int = int(num)
                if num_int in number_map:
                    valid_ids.append(number_map[num_int])
                else:
                    logger.warning(f"AI selected invalid item number: {num}")
            except (ValueError, TypeError):
                logger.warning(f"AI returned non-numeric item: {num}")

        seen = set()
        unique_ids = []
        for item_id in valid_ids:
            if item_id not in seen:
                seen.add(item_id)
                unique_ids.append(item_id)
        valid_ids = unique_ids

        if not valid_ids:
            raise AIRecommendationError("AI did not select any valid items")

        # Deduplicate by body slot (e.g. prevent shorts + pants)
        items_result = await self.db.execute(
            select(ClothingItem.id, ClothingItem.type).where(ClothingItem.id.in_(valid_ids))
        )
        item_type_map = {row.id: (row.type or "").lower() for row in items_result}
        valid_ids = deduplicate_by_body_slot(valid_ids, item_type_map)

        selected_items_result = await self.db.execute(
            select(ClothingItem).where(ClothingItem.id.in_(valid_ids))
        )
        selected_items_by_id = {item.id: item for item in selected_items_result.scalars().all()}
        selected_items = [selected_items_by_id[item_id] for item_id in valid_ids if item_id in selected_items_by_id]

        if "try_on_image_path" not in outfit_data:
            try:
                try_on_path = await self._generate_try_on_image(
                    user=user,
                    outfit_data=outfit_data,
                    items=selected_items,
                    occasion=occasion,
                    language=language,
                )
                if try_on_path:
                    outfit_data["try_on_image_path"] = try_on_path
                    outfit_data["_image_model"] = get_settings().bg_removal_model
            except Exception as exc:
                logger.warning("Try-on image generation failed; continuing without image: %s", exc)

        reasoning = outfit_data.get("headline") or outfit_data.get("reasoning")
        style_notes = outfit_data.get("styling_tip") or outfit_data.get("style_notes")

        outfit = Outfit(
            user_id=user.id,
            occasion=occasion,
            weather_data=weather.to_dict(),
            scheduled_for=scheduled_date or get_user_today(user),
            reasoning=reasoning,
            style_notes=style_notes,
            ai_raw_response=outfit_data,
            source=source,
            status=OutfitStatus.pending,
        )

        self.db.add(outfit)
        await self.db.flush()

        layers = outfit_data.get("layers", {})
        for position, item_id in enumerate(valid_ids):
            layer_type = None
            for layer_name, layer_id in layers.items():
                if layer_id == str(item_id):
                    layer_type = layer_name
                    break

            outfit_item = OutfitItem(
                outfit_id=outfit.id,
                item_id=item_id,
                position=position,
                layer_type=layer_type,
            )
            self.db.add(outfit_item)

        await self.db.commit()
        await self.db.refresh(outfit)

        result = await self.db.execute(
            select(Outfit)
            .where(Outfit.id == outfit.id)
            .options(
                selectinload(Outfit.items).selectinload(OutfitItem.item),
                selectinload(Outfit.feedback),
                selectinload(Outfit.family_ratings).selectinload(FamilyOutfitRating.user),
            )
        )
        outfit = result.scalar_one()

        logger.info(f"Created outfit {outfit.id} with {len(valid_ids)} items")
        return outfit


    async def _get_weather_for_context(
        self, user: User, weather_override: WeatherData | None = None
    ) -> WeatherData:
        if weather_override:
            return weather_override
        if user.location_lat is None or user.location_lon is None:
            raise ValueError("User location not set. Please set location in settings.")
        try:
            return await self.weather_service.get_current_weather(
                float(user.location_lat), float(user.location_lon)
            )
        except WeatherServiceError as e:
            logger.error(f"Weather service failed: {e}")
            raise ValueError(
                "Could not fetch weather data. Please try again or provide weather manually."
            ) from e

    async def suggest_existing_outfit(
        self,
        user: User,
        occasion: str,
        weather_override: WeatherData | None = None,
        time_of_day: str | None = None,
        user_request: str | None = None,
    ) -> Outfit:
        weather = await self._get_weather_for_context(user, weather_override)
        if not time_of_day:
            time_of_day = get_time_of_day(user)

        result = await self.db.execute(
            select(Outfit)
            .where(
                and_(
                    Outfit.user_id == user.id,
                    Outfit.status != OutfitStatus.rejected,
                )
            )
            .options(
                selectinload(Outfit.items).selectinload(OutfitItem.item),
                selectinload(Outfit.feedback),
                selectinload(Outfit.family_ratings).selectinload(FamilyOutfitRating.user),
            )
            .order_by(Outfit.created_at.desc())
            .limit(80)
        )
        outfits = list(result.scalars().unique().all())
        if not outfits:
            raise ValueError("No existing outfits found. Generate an AI outfit first or save looks to your lookbook.")

        def score(outfit: Outfit) -> float:
            score_value = 0.0
            if outfit.occasion == occasion:
                score_value += 40
            elif occasion in {"casual", "weekend"} and outfit.occasion in {"casual", "outdoor", "travel"}:
                score_value += 18
            elif occasion in {"office", "work", "business-casual"} and outfit.occasion in {"office", "work", "smart-casual", "business-casual"}:
                score_value += 18
            if outfit.scheduled_for is None:
                score_value += 12
            if outfit.feedback and outfit.feedback.rating:
                score_value += outfit.feedback.rating * 4
            if outfit.status == OutfitStatus.accepted:
                score_value += 8
            weather_data = outfit.weather_data or {}
            old_temp = weather_data.get("temperature")
            if isinstance(old_temp, (int, float)):
                score_value += max(0.0, 20.0 - abs(float(old_temp) - float(weather.temperature)))
            condition = str(weather_data.get("condition", "")).lower()
            if condition and condition in weather.condition.lower():
                score_value += 8
            item_count = len(outfit.items or [])
            if item_count >= 2:
                score_value += min(item_count, 5)
            return score_value

        selected = max(outfits, key=score)
        selected.weather_data = weather.to_dict()
        selected.scheduled_for = get_user_today(user)
        selected.status = OutfitStatus.pending
        selected.source = OutfitSource.on_demand
        selected.reasoning = (
            f"Best saved outfit for {occasion} in {round(weather.temperature)}°C {weather.condition} weather."
        )
        selected.style_notes = (
            f"Chosen from your existing outfits because it best matches the current scenario, weather, and {time_of_day} timing."
        )
        if user_request and user_request.strip():
            selected.style_notes += f" Preference considered: {user_request.strip()}"
        raw = dict(selected.ai_raw_response or {})
        raw.setdefault("highlights", [
            f"Matches the {occasion} scenario.",
            f"Weather fit: {round(weather.temperature)}°C and {weather.condition}.",
            f"Good timing for {time_of_day}.",
        ])
        selected.ai_raw_response = raw
        await self.db.commit()
        await self.db.refresh(selected)

        refreshed = await self.db.execute(
            select(Outfit)
            .where(Outfit.id == selected.id)
            .options(
                selectinload(Outfit.items).selectinload(OutfitItem.item),
                selectinload(Outfit.feedback),
                selectinload(Outfit.family_ratings).selectinload(FamilyOutfitRating.user),
            )
        )
        return refreshed.scalar_one()

    async def generate_recommendation(
        self,
        user: User,
        occasion: str,
        weather_override: WeatherData | None = None,
        exclude_items: list[UUID] | None = None,
        include_items: list[UUID] | None = None,
        source: OutfitSource = OutfitSource.on_demand,
        time_of_day: str | None = None,
        single_outfit: bool = False,
        scheduled_date: date | None = None,
        language: str | None = "en",
        user_request: str | None = None,
    ) -> Outfit:
        exclude_items = exclude_items or []
        include_items = include_items or []
        user_request = user_request.strip() if user_request and user_request.strip() else None

        if not time_of_day:
            time_of_day = get_time_of_day(user)

        # Determine cache eligibility before auto-merge. Free-text preference/refinement
        # requests must not reuse or populate the generic suggestion cache.
        use_cache = not exclude_items and not include_items and not single_outfit and not user_request

        # Auto-exclude today's rejected items for this occasion
        rejected_ids = await self._get_today_rejected_item_ids(user, occasion)
        if rejected_ids:
            exclude_items = list(set(exclude_items) | rejected_ids)
            logger.info(f"Auto-excluding {len(rejected_ids)} rejected items for user {user.id}")

        # Get weather
        weather = await self._get_weather_for_context(user, weather_override)

        preferences = user.preferences

        ai_endpoints = None
        if preferences and preferences.ai_endpoints:
            ai_endpoints = preferences.ai_endpoints
        ai_service = AIService(endpoints=ai_endpoints)

        # Get candidate items (hard exclusions only)
        candidates = await self.get_candidate_items(
            user=user,
            weather=weather,
            occasion=occasion,
            preferences=preferences,
            exclude_items=exclude_items,
        )

        # Force-include specific items
        if include_items:
            include_set = set(include_items)
            existing_ids = {item.id for item in candidates}
            missing_ids = include_set - existing_ids

            if missing_ids:
                result = await self.db.execute(
                    select(ClothingItem).where(
                        and_(
                            ClothingItem.id.in_(missing_ids),
                            ClothingItem.user_id == user.id,
                            ClothingItem.status == ItemStatus.ready,
                            ClothingItem.is_archived.is_(False),
                        )
                    )
                )
                forced_items = list(result.scalars().all())
                candidates.extend(forced_items)
                logger.info(f"Force-included {len(forced_items)} items in recommendation")

        if len(candidates) < 2:
            diagnostics = await self.get_candidate_item_diagnostics(
                user=user,
                preferences=preferences,
                exclude_items=exclude_items,
            )
            raise InsufficientWardrobeError(
                self._insufficient_wardrobe_message(len(candidates), diagnostics)
            )

        # Check cache for pre-generated suggestions
        if use_cache:
            cached = await pop_suggestion(user.id, occasion, language=language)
            if cached:
                cached_number_map = cached.get("_number_map", {})
                number_map = {int(k): UUID(v) for k, v in cached_number_map.items()}

                cached_item_ids = set()
                for num in cached.get("items", []):
                    str_num = str(int(num))
                    if str_num in cached_number_map:
                        cached_item_ids.add(UUID(cached_number_map[str_num]))

                if cached_item_ids & rejected_ids:
                    logger.info("Cached suggestion contains rejected items, skipping")
                else:
                    logger.info(f"Using cached suggestion for user {user.id}, occasion: {occasion}")
                    return await self._materialize_outfit(
                        cached,
                        user,
                        weather,
                        occasion,
                        source,
                        number_map,
                        scheduled_date=scheduled_date,
                        language=language,
                    )

        # Fetch scoring context
        recently_worn_dates = await self._get_recently_worn_dates(user)
        good_pairs = await self._get_good_item_pairs(user.id)
        learned_prefs = await self._get_learned_preferences(user.id, occasion=occasion)
        if learned_prefs:
            logger.info(
                f"Using learned preferences for user {user.id}: {list(learned_prefs.keys())}"
            )

        # Score items (replaces old filter approach)
        user_today = get_user_today(user)
        lat = float(user.location_lat) if user.location_lat is not None else None
        current_season = get_season(user_today.month, lat)
        scored = score_items(
            items=candidates,
            weather=weather,
            occasion=occasion,
            preferences=preferences,
            user_today=user_today,
            current_season=current_season,
            learned_prefs=learned_prefs,
            good_pairs=good_pairs,
            recently_worn_dates=recently_worn_dates,
        )

        # Format enriched prompt
        items_text, number_map = self._format_items_for_prompt(scored, good_pairs, user_today)

        worn_combinations = await self._get_recently_worn_outfit_combinations(user, days=7)

        preferences_text = self._format_preferences_for_prompt(
            preferences,
            learned_prefs,
            worn_combinations,
            number_map,
            occasion=occasion,
            body_measurements=getattr(user, "body_measurements", None),
            gender=getattr(user, "gender", None),
            user_request=user_request,
        )

        prompt = RECOMMENDATION_PROMPT.format(
            occasion=occasion,
            time_of_day=time_of_day,
            temperature=weather.temperature,
            feels_like=weather.feels_like,
            condition=weather.condition,
            precipitation_chance=weather.precipitation_chance,
            preferences_text=preferences_text + self._language_instruction(language),
            items_text=items_text,
        )

        # For single_outfit mode (notifications), replace multi-outfit format
        if single_outfit:
            prompt = re.sub(
                r"Respond with valid JSON containing exactly 3.*$",
                SINGLE_OUTFIT_FORMAT,
                prompt,
                flags=re.DOTALL,
            )

        logger.info(
            f"Generating recommendation for user {user.id}, "
            f"occasion: {occasion}, items: {len(scored)}"
        )

        try:
            result = await ai_service.generate_text(prompt, return_metadata=True)
            logger.info(
                f"AI recommendation generated (model: {result.model}, endpoint: {result.endpoint})"
            )
            logger.debug(f"AI raw response: {result.content[:500]}")

            if single_outfit:
                outfit_data = self._parse_ai_response(result.content)
                if isinstance(outfit_data, list) and len(outfit_data) > 0:
                    outfit_data = outfit_data[0]
                if not isinstance(outfit_data, dict):
                    raise ValueError(f"Expected dict, got {type(outfit_data)}")
                outfit_data["_ai_model"] = result.model
                outfit_data["_ai_endpoint"] = result.endpoint
                return await self._materialize_outfit(
                    outfit_data,
                    user,
                    weather,
                    occasion,
                    source,
                    number_map,
                    scheduled_date=scheduled_date,
                    language=language,
                )

            # Multi-outfit parse
            outfit_list = self._parse_multi_outfit_response(result.content)

            first = outfit_list[0]
            first["_ai_model"] = result.model
            first["_ai_endpoint"] = result.endpoint

            outfit = await self._materialize_outfit(
                first,
                user,
                weather,
                occasion,
                source,
                number_map,
                scheduled_date=scheduled_date,
                language=language,
            )

            # Cache remaining outfits for "Try Another" only for generic suggestions.
            if use_cache and len(outfit_list) > 1:
                serializable_map = {str(k): str(v) for k, v in number_map.items()}
                to_cache = []
                for od in outfit_list[1:]:
                    od["_number_map"] = serializable_map
                    od["_ai_model"] = result.model
                    od["_ai_endpoint"] = result.endpoint
                    to_cache.append(od)
                await push_suggestions(user.id, occasion, to_cache, language=language)
                logger.info(f"Cached {len(to_cache)} additional suggestions for user {user.id}")

            return outfit

        except AIRecommendationError:
            raise
        except Exception as e:
            logger.error(f"AI recommendation failed: {e}")
            raise AIRecommendationError(
                "AI service is not available. Please check your AI endpoint configuration in Settings."
            ) from e


class InsufficientWardrobeError(Exception):
    pass


class AIRecommendationError(Exception):
    pass
