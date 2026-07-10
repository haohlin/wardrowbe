#!/usr/bin/env python3
"""Verify Haohan's local Wardrowbe LAN/Tailscale preview is actually serving the app.

This is an operational guard, not a unit test: run it after every Wardrowbe code
change, service restart, proxy change, or Tailscale Serve change before saying the
phone preview is ready.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

TAILSCALE_HOST = "g7x9r272rq.tail37713f.ts.net"

API_CHECKS = [
    "http://127.0.0.1:8000/api/v1/health",
]

WARDROWBE_HTML_CHECKS = [
    "http://127.0.0.1:3000/login",
    "http://127.0.0.1:8795/login",
    "http://127.0.0.1:8795/dashboard/suggest",
    "http://127.0.0.1:8795/wardrowbe/login",
    "https://g7x9r272rq.tail37713f.ts.net/login",
    "https://g7x9r272rq.tail37713f.ts.net/dashboard/suggest",
    "https://g7x9r272rq.tail37713f.ts.net:8443/login",
    "https://g7x9r272rq.tail37713f.ts.net:8443/dashboard/suggest",
    "https://g7x9r272rq.tail37713f.ts.net/wardrowbe/login",
]

TRIP_PLAN_CHECKS = [
    "https://g7x9r272rq.tail37713f.ts.net/trip-plan/trip_plan.html",
]

REQUIRED_LISTENERS = {
    8000: "backend",
    3000: "frontend",
    8795: "wardrowbe unified proxy",
}

EXPECTED_TAILSCALE_ROUTES = {
    "root /": (f"https://{TAILSCALE_HOST} (tailnet only)", "/", "127.0.0.1:8795"),
    ":8443 /": (f"https://{TAILSCALE_HOST}:8443 (tailnet only)", "/", "127.0.0.1:8795"),
    "/trip-plan": (f"https://{TAILSCALE_HOST} (tailnet only)", "/trip-plan", "127.0.0.1:8793"),
}

BAD_TEXT_DOWNLOAD_SIGNATURES = [
    "wardrobe.txt",
    "text/plain",
    "application/octet-stream",
    "Content-Disposition: attachment",
]


@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str


def run(cmd: list[str], timeout: int = 20) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, timeout=timeout)


def fetch(url: str, timeout: int = 25) -> tuple[int, str, bytes, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "wardrowbe-preview-guard/1.0"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(request, timeout=timeout) as response:
            status = response.status
            content_type = response.headers.get("Content-Type", "")
            headers = str(response.headers)
            body = response.read()
            return status, content_type, body, headers
    except urllib.error.HTTPError as exc:
        body = exc.read()
        return exc.code, exc.headers.get("Content-Type", ""), body, str(exc.headers)


def check_listener(port: int, label: str) -> CheckResult:
    proc = run(["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"], timeout=10)
    if proc.returncode == 0 and f":{port} (LISTEN)" in proc.stdout:
        first_line = proc.stdout.splitlines()[1] if len(proc.stdout.splitlines()) > 1 else "listening"
        return CheckResult(f"listener:{port}", True, f"{label}: {first_line}")
    return CheckResult(f"listener:{port}", False, f"{label} is not listening on :{port}")


def check_tailscale_status() -> list[CheckResult]:
    if not shutil.which("tailscale"):
        return [CheckResult("tailscale:status", False, "tailscale command not found")]
    proc = run(["tailscale", "serve", "status"], timeout=20)
    text = proc.stdout + proc.stderr
    sections = re.split(r"(?=https://)", text)
    results: list[CheckResult] = []
    for name, (section_header, route, target) in EXPECTED_TAILSCALE_ROUTES.items():
        section = next((part for part in sections if section_header in part), "")
        route_pattern = rf"\|--\s+{re.escape(route)}\s+proxy\s+http://{re.escape(target)}"
        ok = bool(section and re.search(route_pattern, section))
        results.append(
            CheckResult(
                f"tailscale:{name}",
                ok,
                f"expected {section_header} {route} -> {target}" if ok else f"missing expected route {section_header} {route} -> {target}\n{text}",
            )
        )
    return results


def assert_no_download_signature(url: str, content_type: str, headers: str, text: str) -> None:
    combined = f"{content_type}\n{headers}\n{text[:1000]}"
    lower = combined.lower()
    for signature in BAD_TEXT_DOWNLOAD_SIGNATURES:
        if signature.lower() in lower:
            raise AssertionError(f"download/text signature found: {signature}")


def check_api(url: str) -> CheckResult:
    try:
        status, content_type, body, headers = fetch(url)
        text = body.decode("utf-8", "replace")
        assert status == 200, f"HTTP {status}"
        assert "application/json" in content_type, f"unexpected content type {content_type!r}"
        data = json.loads(text)
        assert data.get("status") == "healthy", f"missing healthy marker in {data!r}"
        assert_no_download_signature(url, content_type, headers, text)
        return CheckResult(url, True, f"HTTP {status} {content_type} {len(body)} bytes healthy")
    except Exception as exc:  # noqa: BLE001 - guard should report all failures cleanly
        return CheckResult(url, False, str(exc))


def check_wardrowbe_html(url: str) -> CheckResult:
    try:
        status, content_type, body, headers = fetch(url)
        text = body.decode("utf-8", "replace")
        assert status == 200, f"HTTP {status}"
        assert "text/html" in content_type, f"unexpected content type {content_type!r}"
        assert "<!DOCTYPE html>" in text or "<!doctype html>" in text.lower(), "not an HTML document"
        assert "/_next/" in text or re.search(r"wardrobe|wardrowbe", text, re.I), "missing Wardrowbe/Next signature"
        assert len(body) > 1000, f"blank/tiny page: {len(body)} bytes"
        assert_no_download_signature(url, content_type, headers, text)
        return CheckResult(url, True, f"HTTP {status} {content_type} {len(body)} bytes Wardrowbe HTML")
    except Exception as exc:  # noqa: BLE001
        return CheckResult(url, False, str(exc))


def check_trip_plan(url: str) -> CheckResult:
    try:
        status, content_type, body, headers = fetch(url)
        text = body.decode("utf-8", "replace")
        assert status == 200, f"HTTP {status}"
        assert "text/html" in content_type, f"unexpected content type {content_type!r}"
        assert "Summer 2026" in text or "Tropical North Queensland" in text, "missing trip-plan signature"
        assert_no_download_signature(url, content_type, headers, text)
        return CheckResult(url, True, f"HTTP {status} {content_type} {len(body)} bytes trip-plan HTML")
    except Exception as exc:  # noqa: BLE001
        return CheckResult(url, False, str(exc))


def emit(results: Iterable[CheckResult]) -> int:
    failures = 0
    for result in results:
        prefix = "PASS" if result.ok else "FAIL"
        print(f"{prefix} {result.name} — {result.detail}")
        failures += 0 if result.ok else 1
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify Wardrowbe local/Tailscale preview signatures")
    parser.add_argument("--skip-tailscale", action="store_true", help="Only verify local listeners and localhost URLs")
    parser.add_argument("--skip-listeners", action="store_true", help="Skip lsof listener checks")
    args = parser.parse_args()

    results: list[CheckResult] = []
    if not args.skip_listeners:
        results.extend(check_listener(port, label) for port, label in REQUIRED_LISTENERS.items())
    if not args.skip_tailscale:
        results.extend(check_tailscale_status())

    results.extend(check_api(url) for url in API_CHECKS)

    html_urls = WARDROWBE_HTML_CHECKS
    trip_urls = TRIP_PLAN_CHECKS
    if args.skip_tailscale:
        html_urls = [url for url in html_urls if TAILSCALE_HOST not in url]
        trip_urls = []
    results.extend(check_wardrowbe_html(url) for url in html_urls)
    results.extend(check_trip_plan(url) for url in trip_urls)

    failures = emit(results)
    if failures:
        print(f"\nWardrowbe preview guard FAILED: {failures} check(s) failed.", file=sys.stderr)
        return 1
    print("\nWardrowbe preview guard PASSED: backend, frontend, proxy, Tailscale, and trip-plan signatures are correct.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
