from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image

from app.services.image_service import ImageService


def _jpeg_bytes(size: tuple[int, int] = (8, 4), orientation: int | None = None) -> bytes:
    image = Image.new("RGB", size, "red")
    exif = image.getexif()
    if orientation is not None:
        exif[274] = orientation
    output = BytesIO()
    image.save(output, format="JPEG", exif=exif)
    return output.getvalue()


def test_accepts_heic_sequence_mime(monkeypatch, tmp_path):
    service = ImageService(str(tmp_path))
    monkeypatch.setattr(service, "_convert_heic", lambda _: Image.new("RGB", (2, 2)))

    assert service.validate_image(b"heic", "image/heic-sequence", "photo.heic")
    assert service.validate_image(b"heif", "image/heif-sequence", "photo.heif")


def test_generic_mime_requires_supported_image_extension(tmp_path):
    service = ImageService(str(tmp_path))
    image_data = _jpeg_bytes()

    assert service.validate_image(image_data, "application/octet-stream", "photo.jpg")
    assert not service.validate_image(image_data, "application/octet-stream", "photo.txt")


@pytest.mark.asyncio
async def test_stored_derivatives_apply_exif_orientation(tmp_path):
    service = ImageService(str(tmp_path))
    user_id = uuid4()

    paths = await service.process_and_store(
        user_id,
        _jpeg_bytes(size=(8, 4), orientation=6),
        "rotated.jpg",
    )

    with Image.open(service.get_image_path(paths["image_path"])) as stored:
        assert stored.size == (4, 8)

