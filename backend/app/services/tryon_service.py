import base64
import logging
import mimetypes
from pathlib import Path

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class TryOnProviderError(RuntimeError):
    pass


class TryOnService:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def models(self) -> list[str]:
        return list(
            dict.fromkeys(
                model.strip()
                for model in [self.settings.tryon_model, self.settings.tryon_fallback_model]
                if model.strip()
            )
        )

    def _headers(self) -> dict[str, str]:
        if not self.settings.ai_api_key:
            raise TryOnProviderError("AI_API_KEY is not configured")
        return {"Authorization": f"Bearer {self.settings.ai_api_key}"}

    @staticmethod
    def _prompt(garment_count: int) -> str:
        return (
            "Create a photorealistic virtual try-on. The first reference image is the person. "
            f"The following {garment_count} reference image(s) are the exact garments from an outfit. "
            "Dress the same person in those garments. Preserve their identity, face, hair, body shape, "
            "pose, hands, background, camera angle, and lighting. Preserve each garment's color, pattern, "
            "logos, material, and design. Replace only the clothing needed for the outfit. Produce one "
            "natural full-resolution fashion photograph with no text, collage, duplicate person, or extra garments."
        )

    async def generate(self, person_path: Path, garment_paths: list[Path]) -> tuple[bytes, str]:
        if not garment_paths:
            raise TryOnProviderError("The outfit has no usable garment images")

        paths = [person_path, *garment_paths[:10]]
        last_error: Exception | None = None
        timeout = httpx.Timeout(max(self.settings.ai_timeout, 180))

        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            for model in self.models:
                files = []
                handles = []
                try:
                    for path in paths:
                        handle = path.open("rb")
                        handles.append(handle)
                        mime = mimetypes.guess_type(path.name)[0] or "image/jpeg"
                        files.append(("image", (path.name, handle, mime)))
                    response = await client.post(
                        f"{self.settings.ai_base_url.rstrip('/')}/images/edits",
                        headers=self._headers(),
                        data={"model": model, "prompt": self._prompt(len(garment_paths))},
                        files=files,
                    )
                    response.raise_for_status()
                    payload = response.json()
                    encoded = (payload.get("data") or [{}])[0].get("b64_json")
                    if not encoded:
                        raise TryOnProviderError(f"{model} returned no generated image")
                    return base64.b64decode(encoded, validate=True), model
                except (httpx.HTTPError, ValueError, KeyError, TryOnProviderError) as exc:
                    last_error = exc
                    logger.warning("Try-on model %s failed: %s", model, exc)
                finally:
                    for handle in handles:
                        handle.close()

        raise TryOnProviderError(f"All try-on models failed: {last_error}")
