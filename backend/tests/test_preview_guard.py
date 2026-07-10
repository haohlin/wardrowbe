from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts" / "verify_wardrowbe_preview.py"


def test_preview_guard_script_exists_and_checks_exact_tailscale_urls():
    assert SCRIPT.exists(), "missing executable preview guard script"
    source = SCRIPT.read_text()

    expected_urls = [
        "http://127.0.0.1:8000/api/v1/health",
        "http://127.0.0.1:3000/login",
        "http://127.0.0.1:8795/login",
        "http://127.0.0.1:8795/dashboard/suggest",
        "http://127.0.0.1:8795/wardrowbe/login",
        "https://g7x9r272rq.tail37713f.ts.net/login",
        "https://g7x9r272rq.tail37713f.ts.net/dashboard/suggest",
        "https://g7x9r272rq.tail37713f.ts.net:8443/login",
        "https://g7x9r272rq.tail37713f.ts.net:8443/dashboard/suggest",
        "https://g7x9r272rq.tail37713f.ts.net/wardrowbe/login",
        "https://g7x9r272rq.tail37713f.ts.net/trip-plan/trip_plan.html",
    ]
    for url in expected_urls:
        assert url in source


def test_preview_guard_rejects_text_downloads_blank_pages_and_wrong_tailscale_shape():
    source = SCRIPT.read_text()

    # The guard must prove content signatures; HTTP 200 alone is not enough.
    assert "wardrobe.txt" in source
    assert "text/plain" in source
    assert "<!DOCTYPE html>" in source
    assert "/_next/" in source
    assert "healthy" in source

    # Tailscale Serve must preserve Wardrowbe root/:8443 and not clobber /trip-plan.
    assert "127.0.0.1:8795" in source
    assert "127.0.0.1:8793" in source
    assert "/trip-plan" in source
    assert ":8443" in source


def test_routine_commands_include_preview_guard():
    makefile = ROOT / "Makefile"
    workflow = ROOT / ".github" / "workflows" / "preview-guard.yml"
    pre_commit = ROOT / ".pre-commit-config.yaml"

    assert makefile.exists(), "missing root Makefile for routine local checks"
    make_source = makefile.read_text()
    assert "verify-preview" in make_source
    assert "scripts/verify_wardrowbe_preview.py" in make_source
    assert "check" in make_source

    assert workflow.exists(), "missing CI workflow for routine regression tests"
    workflow_source = workflow.read_text()
    assert "test_preview_guard.py" in workflow_source
    assert "Preview guard structure regression" in workflow_source

    assert pre_commit.exists(), "missing pre-commit hook config"
    pre_commit_source = pre_commit.read_text()
    assert "wardrowbe-preview-guard-structure" in pre_commit_source
    assert "test_preview_guard.py" in pre_commit_source
