from io import BytesIO

from PIL import Image

from app.services.image_service import ImageService


def _jpeg_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (8, 4), "red").save(output, format="JPEG")
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
    assert not service.validate_image(image_data, "application/octet-stream")


def test_content_type_parameters_and_case_are_ignored(tmp_path):
    service = ImageService(str(tmp_path))

    assert service.validate_image(_jpeg_bytes(), "Image/JPEG; charset=binary", "photo.jpg")
