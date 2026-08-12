import os
import stat
import subprocess
from pathlib import Path


DEPLOY_DIR = Path(__file__).resolve().parents[1]


def test_rendered_dex_config_supports_web_mobile_tailscale_and_password(tmp_path):
    runtime_env = tmp_path / "runtime.env"
    runtime_env.write_text(
        "\n".join(
            [
                "TAILSCALE_DNS_NAME=mac.example.ts.net",
                "DEX_WEB_CLIENT_SECRET=web-secret-value-0123456789abcdef",
                "OWNER_EMAIL=owner@example.com",
                "OWNER_PASSWORD_HASH=$2y$12$examplehash",
                "OWNER_USER_ID=11111111-1111-4111-8111-111111111111",
            ]
        )
        + "\n"
    )
    os.chmod(runtime_env, 0o600)
    output = tmp_path / "dex.yaml"

    subprocess.run(
        [
            "python3",
            str(DEPLOY_DIR / "render_config.py"),
            str(runtime_env),
            str(DEPLOY_DIR / "dex.yaml.template"),
            str(output),
        ],
        check=True,
    )

    rendered = output.read_text()
    assert "issuer: https://mac.example.ts.net:8446/dex" in rendered
    assert "id: wardrowbe-web" in rendered
    assert "secret: web-secret-value-0123456789abcdef" in rendered
    assert "id: wardrowbe-mobile" in rendered
    assert "public: true" in rendered
    assert (
        "https://mac.example.ts.net:8445/api/v1/auth/mobile-callback" in rendered
    )
    assert "type: authproxy" in rendered
    assert "userHeader: Tailscale-User-Login" in rendered
    assert "userNameHeader: Tailscale-User-Name" in rendered
    assert "enablePasswordDB: true" in rendered
    assert 'email: "owner@example.com"' in rendered
    assert 'hash: "$2y$12$examplehash"' in rendered
    assert "plaintext-password" not in rendered
    assert stat.S_IMODE(output.stat().st_mode) == 0o600


def test_renderer_rejects_missing_values(tmp_path):
    runtime_env = tmp_path / "runtime.env"
    runtime_env.write_text("OWNER_EMAIL=owner@example.com\n")
    os.chmod(runtime_env, 0o600)
    output = tmp_path / "dex.yaml"

    result = subprocess.run(
        [
            "python3",
            str(DEPLOY_DIR / "render_config.py"),
            str(runtime_env),
            str(DEPLOY_DIR / "dex.yaml.template"),
            str(output),
        ],
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert not output.exists()
    assert "Missing required runtime values" in result.stderr


def test_renderer_rejects_group_writable_secret_file(tmp_path):
    runtime_env = tmp_path / "runtime.env"
    runtime_env.write_text("OWNER_EMAIL=owner@example.com\n")
    os.chmod(runtime_env, 0o660)

    result = subprocess.run(
        [
            "python3",
            str(DEPLOY_DIR / "render_config.py"),
            str(runtime_env),
            str(DEPLOY_DIR / "dex.yaml.template"),
            str(tmp_path / "dex.yaml"),
        ],
        capture_output=True,
        text=True,
    )

    assert result.returncode != 0
    assert "must not be accessible by group or other users" in result.stderr
