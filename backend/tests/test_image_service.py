from app.services.image_service import ImageService


def test_validate_image_accepts_iphone_heic_content_type_alias(monkeypatch):
    service = ImageService(storage_path="/tmp/wardrobe_test_images")
    called = {}

    def fake_convert_heic(image_data: bytes):
        called["data"] = image_data
        return object()

    monkeypatch.setattr(service, "_convert_heic", fake_convert_heic)

    assert service.validate_image(b"fake-heic", "image/heic", "shirt.heic") is True
    assert service.validate_image(b"fake-heic", "image/heif", "shirt.heif") is True
    assert service.validate_image(b"fake-heic", "image/heic-sequence", "shirt.heic") is True
    assert service.validate_image(b"fake-heic", "image/heif-sequence", "shirt.heif") is True
    assert service.validate_image(b"fake-heic", "application/octet-stream", "shirt.heic") is True
    assert called["data"] == b"fake-heic"
