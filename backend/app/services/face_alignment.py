"""Best-effort face alignment for native before/after try-on comparisons."""

import json
import subprocess
from pathlib import Path


def detect_face_center(image_path: Path) -> tuple[float, float] | None:
    """Return normalized face center when macOS Vision can detect one."""
    script = r"""
import Foundation
import Vision
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let request = VNDetectFaceRectanglesRequest()
let handler = VNImageRequestHandler(url: url, options: [:])
try handler.perform([request])
if let face = request.results?.max(by: { $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height }) {
    let box = face.boundingBox
    print("{\"x\":\(box.midX),\"y\":\(box.midY)}")
}
"""
    try:
        completed = subprocess.run(
            ["swift", "-e", script, str(image_path)],
            check=True,
            capture_output=True,
            text=True,
            timeout=20,
        )
        output = completed.stdout.strip()
        if not output:
            return None
        result = json.loads(output)
        return float(result["x"]), float(result["y"])
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError, KeyError, ValueError):
        return None
