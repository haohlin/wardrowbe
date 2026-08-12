from datetime import time
from uuid import uuid4

import pytest
from httpx import AsyncClient

from app.models.item import ClothingItem, ItemStatus
from app.models.outfit import Outfit
from app.models.schedule import Schedule


class TestUserMe:
    """Tests for current user endpoint."""

    @pytest.mark.asyncio
    async def test_get_current_user(self, client: AsyncClient, test_user, auth_headers):
        """Test getting current user info."""
        response = await client.get("/api/v1/users/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == str(test_user.id)
        assert data["email"] == test_user.email
        assert data["display_name"] == test_user.display_name

    @pytest.mark.asyncio
    async def test_get_current_user_unauthorized(self, client: AsyncClient):
        """Test that unauthorized request returns 401."""
        response = await client.get("/api/v1/users/me")
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_activation_reports_native_app_progress(
        self, client: AsyncClient, test_user, auth_headers, db_session
    ):
        items = [
            ClothingItem(
                user_id=test_user.id,
                type="shirt",
                image_path=f"test/{uuid4()}.jpg",
                status=ItemStatus.ready,
            )
            for _ in range(5)
        ]
        items.extend(
            [
                ClothingItem(
                    user_id=test_user.id,
                    type="shirt",
                    image_path=f"test/{uuid4()}.jpg",
                    status=ItemStatus.processing,
                ),
                ClothingItem(
                    user_id=test_user.id,
                    type="shirt",
                    image_path=f"test/{uuid4()}.jpg",
                    status=ItemStatus.ready,
                    is_archived=True,
                ),
            ]
        )
        db_session.add_all(
            [
                *items,
                Outfit(user_id=test_user.id, occasion="casual"),
                Outfit(user_id=test_user.id, occasion="office"),
                Schedule(
                    user_id=test_user.id,
                    day_of_week=0,
                    notification_time=time(7, 0),
                    enabled=True,
                ),
                Schedule(
                    user_id=test_user.id,
                    day_of_week=1,
                    notification_time=time(8, 0),
                    enabled=False,
                ),
            ]
        )
        await db_session.commit()

        response = await client.get("/api/v1/users/me/activation", headers=auth_headers)

        assert response.status_code == 200
        assert response.json() == {
            "items_ready": 5,
            "total_outfits": 2,
            "active_schedules": 1,
        }


class TestUserUpdate:
    """Tests for user update endpoint."""

    @pytest.mark.asyncio
    async def test_update_user(self, client: AsyncClient, test_user, auth_headers):
        """Test updating user information."""
        response = await client.patch(
            "/api/v1/users/me",
            json={
                "display_name": "Updated Name",
                "timezone": "America/New_York",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["display_name"] == "Updated Name"
        assert data["timezone"] == "America/New_York"

    @pytest.mark.asyncio
    async def test_update_user_location(self, client: AsyncClient, test_user, auth_headers):
        """Test updating user location."""
        response = await client.patch(
            "/api/v1/users/me",
            json={
                "location_lat": 40.7128,
                "location_lon": -74.0060,
                "location_name": "New York City",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["location_name"] == "New York City"
        # Check coordinates are stored (may be string or float depending on serialization)
        assert float(data["location_lat"]) == pytest.approx(40.7128, rel=1e-4)
        assert float(data["location_lon"]) == pytest.approx(-74.0060, rel=1e-4)

    @pytest.mark.asyncio
    async def test_gender_is_optional(self, client: AsyncClient, test_user, auth_headers):
        response = await client.get("/api/v1/users/me", headers=auth_headers)

        assert response.status_code == 200
        assert response.json()["gender"] is None

    @pytest.mark.asyncio
    @pytest.mark.parametrize("gender", ["female", "male", "non_binary", "prefer_not_to_say"])
    async def test_update_gender(self, client: AsyncClient, test_user, auth_headers, gender):
        response = await client.patch(
            "/api/v1/users/me",
            json={"gender": gender},
            headers=auth_headers,
        )

        assert response.status_code == 200
        assert response.json()["gender"] == gender

    @pytest.mark.asyncio
    async def test_rejects_unknown_gender(self, client: AsyncClient, test_user, auth_headers):
        response = await client.patch(
            "/api/v1/users/me",
            json={"gender": "other-value"},
            headers=auth_headers,
        )

        assert response.status_code == 422


class TestUserLocale:
    @pytest.mark.asyncio
    async def test_default_locale_is_en(self, client: AsyncClient, test_user, auth_headers):
        response = await client.get("/api/v1/users/me", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["locale"] == "en"

    @pytest.mark.asyncio
    async def test_update_locale(self, client: AsyncClient, test_user, auth_headers):
        response = await client.patch(
            "/api/v1/users/me",
            json={"locale": "zh-CN"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["locale"] == "zh-CN"

        response = await client.get("/api/v1/users/me", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["locale"] == "zh-CN"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("locale", ["en", "zh-CN", "zh-TW", "ko", "ja", "fr", "de", "it"])
    async def test_all_supported_locales_accepted(
        self, client: AsyncClient, test_user, auth_headers, locale
    ):
        response = await client.patch(
            "/api/v1/users/me",
            json={"locale": locale},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["locale"] == locale

    @pytest.mark.asyncio
    @pytest.mark.parametrize("locale", ["xx", "", "en-US-posix", "x" * 11, "EN", "en_US", None])
    async def test_unsupported_locale_rejected(
        self, client: AsyncClient, test_user, auth_headers, locale
    ):
        response = await client.patch(
            "/api/v1/users/me",
            json={"locale": locale},
            headers=auth_headers,
        )
        assert response.status_code == 422

        response = await client.get("/api/v1/users/me", headers=auth_headers)
        assert response.json()["locale"] == "en"

    @pytest.mark.asyncio
    async def test_update_locale_with_other_field(
        self, client: AsyncClient, test_user, auth_headers
    ):
        response = await client.patch(
            "/api/v1/users/me",
            json={"locale": "ja", "display_name": "Locale User"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["locale"] == "ja"
        assert data["display_name"] == "Locale User"

    @pytest.mark.asyncio
    async def test_omitting_locale_preserves_existing(
        self, client: AsyncClient, test_user, auth_headers
    ):
        await client.patch("/api/v1/users/me", json={"locale": "de"}, headers=auth_headers)

        response = await client.patch(
            "/api/v1/users/me",
            json={"display_name": "Still German"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["display_name"] == "Still German"
        assert data["locale"] == "de"

    @pytest.mark.asyncio
    async def test_update_locale_unauthorized(self, client: AsyncClient):
        response = await client.patch("/api/v1/users/me", json={"locale": "fr"})
        assert response.status_code == 401


class TestOnboarding:
    """Tests for onboarding completion endpoint."""

    @pytest.mark.asyncio
    async def test_complete_onboarding(self, client: AsyncClient, test_user, auth_headers):
        """Test completing onboarding."""
        response = await client.post(
            "/api/v1/users/me/onboarding/complete",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["onboarding_completed"] is True

    @pytest.mark.asyncio
    async def test_onboarding_already_completed(
        self, client: AsyncClient, test_user, auth_headers, db_session
    ):
        """Test completing onboarding when already completed."""
        # Mark onboarding as completed
        test_user.onboarding_completed = True
        await db_session.commit()

        response = await client.post(
            "/api/v1/users/me/onboarding/complete",
            headers=auth_headers,
        )
        # Should still succeed (idempotent)
        assert response.status_code == 200
        data = response.json()
        assert data["onboarding_completed"] is True
