from pathlib import Path


DEPLOY_DIR = Path(__file__).resolve().parents[1]


def read(name: str) -> str:
    return (DEPLOY_DIR / name).read_text()


def test_compose_pins_dex_and_binds_loopback():
    compose = read("compose.yaml")
    assert "ghcr.io/dexidp/dex:v2.45.1" in compose
    assert '"127.0.0.1:5556:5556"' in compose
    assert "dex-data:/var/dex" in compose


def test_setup_adds_only_private_serve_routes():
    setup = read("setup.sh")
    assert "tailscale serve --bg --https=8445 http://127.0.0.1:3000" in setup
    assert "tailscale serve --bg --https=8446 http://127.0.0.1:5556" in setup
    assert "tailscale funnel" not in setup
    assert "serve reset" not in setup
    assert "htpasswd -nBC 12" in setup


def test_wardrowbe_runtime_forces_oidc_and_loopback():
    runtime = read("wardrowbe.sh")
    assert 'app_env="$runtime_dir/wardrowbe.env"' in runtime
    assert 'source "$runtime_env"' not in runtime
    assert 'export DEBUG="false"' in runtime
    assert 'export DEV_MODE="false"' in runtime
    assert "--host 127.0.0.1 --port 8001" in runtime
    assert "--hostname 127.0.0.1 --port 3000" in runtime


def test_check_requires_mobile_client_and_dev_mode_off():
    check = read("check.sh")
    assert 'source "$app_env"' in check
    assert 'source "$runtime_env"' not in check
    assert 'client_id == "wardrowbe-mobile"' in check
    assert "dev_mode == false" in check
    assert "--noproxy '*'" in check
