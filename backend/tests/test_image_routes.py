from uuid import uuid4

import pytest

from app.utils.signed_urls import sign_image_url


@pytest.mark.asyncio
async def test_nested_signed_image_url_serves_file(client, tmp_path, monkeypatch):
    user_id = uuid4()
    storage = tmp_path / "wardrobe"
    nested = storage / str(user_id) / "outfit_tryons"
    nested.mkdir(parents=True)
    image = nested / "look.png"
    image.write_bytes(b"not really png")

    monkeypatch.setattr("app.services.image_service.settings.storage_path", str(storage))

    url = sign_image_url(f"{user_id}/outfit_tryons/look.png")
    response = await client.get(url)

    assert response.status_code == 200
    assert response.content == b"not really png"
