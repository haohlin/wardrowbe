#!/usr/bin/env python3
"""Render private Dex configuration from a mode-600 runtime environment file."""

from __future__ import annotations

import os
import re
import stat
import sys
import tempfile
from pathlib import Path


REQUIRED = {
    "TAILSCALE_DNS_NAME",
    "DEX_WEB_CLIENT_SECRET",
    "OWNER_EMAIL",
    "OWNER_PASSWORD_HASH",
    "OWNER_USER_ID",
}
SAFE_DNS = re.compile(r"^[a-z0-9][a-z0-9.-]*[a-z0-9]$")
SAFE_EMAIL = re.compile(r"^[^\s\"'@]+@[^\s\"'@]+$")
SAFE_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
)


def load_runtime_env(path: Path) -> dict[str, str]:
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        raise ValueError(f"{path} must not be accessible by group or other users")

    values: dict[str, str] = {}
    for line_number, raw_line in enumerate(path.read_text().splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"Invalid runtime value on line {line_number}")
        key, value = line.split("=", 1)
        values[key] = value

    missing = sorted(REQUIRED - values.keys())
    if missing:
        raise ValueError(f"Missing required runtime values: {', '.join(missing)}")
    return values


def validate(values: dict[str, str]) -> None:
    if not SAFE_DNS.fullmatch(values["TAILSCALE_DNS_NAME"]):
        raise ValueError("Invalid TAILSCALE_DNS_NAME")
    if not SAFE_EMAIL.fullmatch(values["OWNER_EMAIL"]):
        raise ValueError("Invalid OWNER_EMAIL")
    if not SAFE_UUID.fullmatch(values["OWNER_USER_ID"].lower()):
        raise ValueError("Invalid OWNER_USER_ID")
    if not values["OWNER_PASSWORD_HASH"].startswith(("$2a$", "$2b$", "$2y$")):
        raise ValueError("OWNER_PASSWORD_HASH must be bcrypt")
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,}", values["DEX_WEB_CLIENT_SECRET"]):
        raise ValueError("DEX_WEB_CLIENT_SECRET is invalid")


def render(values: dict[str, str], template: str) -> str:
    rendered = template
    for key in REQUIRED:
        rendered = rendered.replace(f"@@{key}@@", values[key])
    if "@@" in rendered:
        raise ValueError("Unresolved template placeholder")
    return rendered


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w") as output:
            output.write(content)
        os.replace(temporary_name, path)
        os.chmod(path, 0o600)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: render_config.py ENV_FILE TEMPLATE OUTPUT", file=sys.stderr)
        return 2

    try:
        values = load_runtime_env(Path(sys.argv[1]))
        validate(values)
        rendered = render(values, Path(sys.argv[2]).read_text())
        atomic_write(Path(sys.argv[3]), rendered)
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
