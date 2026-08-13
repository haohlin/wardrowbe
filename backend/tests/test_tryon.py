from io import BytesIO
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from httpx import AsyncClient
from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.item import ClothingItem, ItemStatus
from app.models.outfit import Outfit, OutfitItem, OutfitSource
from app.models.tryon import TryOn, TryOnStatus
from app.workers.tryon import generate_tryon


def _jpeg() -> bytes:
    output = BytesIO()
    Image.new("RGB", (48, 64), "white").save(output, format="JPEG")
    return output.getvalue()


async def _outfit(db: AsyncSession, user_id) -> Outfit:
    item = ClothingItem(
        user_id=user_id,
        type="shirt",
        image_path=f"{user_id}/shirt.jpg",
        status=ItemStatus.ready,
    )
    db.add(item)
    await db.flush()
    outfit = Outfit(user_id=user_id, occasion="casual", source=OutfitSource.manual)
    outfit.items.append(OutfitItem(item_id=item.id, position=0))
    db.add(outfit)
    await db.commit()
    await db.refresh(outfit)
    return outfit


@pytest.mark.asyncio
async def test_native_upload_creates_and_queues_tryon(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user,
    auth_headers,
    tmp_path,
):
    outfit = await _outfit(db_session, test_user.id)
    redis = AsyncMock()
    redis.enqueue_job.return_value.job_id = "tryon-job"

    with (
        patch(
            "app.api.tryon.ImageService",
            return_value=__import__(
                "app.services.image_service", fromlist=["ImageService"]
            ).ImageService(str(tmp_path)),
        ),
        patch("app.api.tryon.create_pool", new_callable=AsyncMock, return_value=redis),
    ):
        response = await client.post(
            "/api/v1/tryon/outfit",
            headers=auth_headers,
            data={"outfit_id": str(outfit.id)},
            files={"photo": ("person.jpg", _jpeg(), "image/jpeg")},
        )

    assert response.status_code == 202
    body = response.json()
    assert body["outfit_id"] == str(outfit.id)
    assert body["status"] == "pending"
    assert body["id"]
    redis.enqueue_job.assert_awaited_once()


@pytest.mark.asyncio
async def test_native_history_and_quota_shape(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user,
    auth_headers,
    tmp_path,
):
    outfit = await _outfit(db_session, test_user.id)
    redis = AsyncMock()
    redis.enqueue_job.return_value.job_id = "tryon-job"
    with (
        patch(
            "app.api.tryon.ImageService",
            return_value=__import__(
                "app.services.image_service", fromlist=["ImageService"]
            ).ImageService(str(tmp_path)),
        ),
        patch("app.api.tryon.create_pool", new_callable=AsyncMock, return_value=redis),
    ):
        created = await client.post(
            "/api/v1/tryon/outfit",
            headers=auth_headers,
            data={"outfitId": str(outfit.id)},
            files={"image": ("person.jpg", _jpeg(), "image/jpeg")},
        )

    history = await client.get(
        f"/api/v1/tryon?outfit_id={outfit.id}&page_size=30", headers=auth_headers
    )
    quota = await client.get("/api/v1/tryon/quota", headers=auth_headers)

    assert history.status_code == 200
    assert history.json()["items"][0]["id"] == created.json()["id"]
    assert history.json()["tryons"][0]["id"] == created.json()["id"]
    assert history.json()["sessions"][0]["id"] == created.json()["id"]
    assert quota.status_code == 200
    assert quota.json()["remaining"] > 0
    assert quota.json()["bonus_credits"] == 0
    assert quota.json()["unlimited"] is True


@pytest.mark.asyncio
async def test_native_upload_rejects_foreign_outfit(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user,
    auth_headers,
):
    other_id = uuid4()
    response = await client.post(
        "/api/v1/tryon/outfit",
        headers=auth_headers,
        data={"outfit_id": str(other_id)},
        files={"image": ("person.jpg", _jpeg(), "image/jpeg")},
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_worker_generates_and_completes_tryon(
    db_session: AsyncSession,
    test_user,
    tmp_path,
):
    outfit = await _outfit(db_session, test_user.id)
    user_dir = tmp_path / str(test_user.id)
    user_dir.mkdir()
    (user_dir / "person.jpg").write_bytes(_jpeg())
    (user_dir / "shirt.jpg").write_bytes(_jpeg())
    record = TryOn(
        user_id=test_user.id,
        outfit_id=outfit.id,
        person_image_path=f"{test_user.id}/person.jpg",
    )
    db_session.add(record)
    await db_session.commit()

    service = AsyncMock()
    service.generate.return_value = (_jpeg(), "gcp/google/gemini-3-pro-image")
    with (
        patch("app.workers.tryon.get_db_session", return_value=db_session),
        patch(
            "app.workers.tryon.ImageService",
            return_value=__import__(
                "app.services.image_service", fromlist=["ImageService"]
            ).ImageService(str(tmp_path)),
        ),
        patch("app.workers.tryon.TryOnService", return_value=service),
        patch.object(db_session, "close", new_callable=AsyncMock),
    ):
        await generate_tryon({}, str(record.id))

    await db_session.refresh(record)
    assert record.status == TryOnStatus.completed
    assert record.result_image_path
    assert (tmp_path / record.result_image_path).is_file()
